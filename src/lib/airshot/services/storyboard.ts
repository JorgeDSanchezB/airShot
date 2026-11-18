// AirShot — services/storyboard.ts (UC-02: la fachada "StoryboardService" de
// §6.1 = este servicio + el esquema zod del output del LLM)
// Síncrono (ADR-014). Salida LLM validada con zod; reintentos y clasificación
// de errores en el adaptador (LLM_INVALID_OUTPUT 502 agotados los reintentos).

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { getLLMProvider } from '@/lib/airshot/infrastructure/providers/factory'
import { toSceneResponse } from '@/lib/airshot/domain/dto'
import type { SceneResponseDto } from '@/lib/airshot/domain/dto'
import { getProjectOr404 } from '@/lib/airshot/services/projects'
import type { z as zType } from 'zod'
import type { StoryboardRequest } from '@/lib/airshot/domain/schemas'

const StoryboardOutput = z.object({
  improvedStory: z.string().min(1).max(airshotConfig.story.max_original_story_length),
  scenes: z
    .array(
      z.strictObject({
        originalText: z.string().min(1).max(airshotConfig.story.max_original_story_length),
        improvedText: z.string().min(1).max(airshotConfig.story.max_original_story_length),
        // INV-13: promptEn ASCII imprimible (§2.4) — el system prompt ya lo exige en inglés
        promptEn: z.string().min(1).max(airshotConfig.scene.prompt_max_length).regex(/^[\x20-\x7E\r\n\t]*$/, 'promptEn debe ser ASCII imprimible (INV-13)'),
        durationSeconds: z.number().int().gte(airshotConfig.scene.min_duration_seconds).lte(airshotConfig.scene.max_duration_seconds),
      }),
    )
    .min(1)
    .max(airshotConfig.scene.max_scenes_per_project),
})

function storyboardSystemPromptEn(targetSeconds: number): string {
  const { min_duration_seconds: min, max_duration_seconds: max, max_scenes_per_project: maxScenes, default_duration_seconds: def } = airshotConfig.scene
  return [
    'You are a story-to-video storyboard engine. Given a story, you return ONE JSON object exactly matching this schema:',
    '{"improvedStory": string, "scenes": [{"originalText": string, "improvedText": string, "promptEn": string, "durationSeconds": integer}]}',
    'Rules:',
    `- improvedStory: same language as the input story, polished narrative prose, no markdown, no headings.`,
    `- originalText: a VERBATIM contiguous fragment of the input story assigned to that scene (copy exactly).`,
    `- improvedText: tighter narration text for that scene, same language as the input story.`,
    `- promptEn: ENGLISH ONLY visual prompt for an image generator: describe what the camera SEES (subject, action, setting, lighting, composition). No dialogue, no camera jargon beyond common terms.`,
    `- durationSeconds: integer between ${min} and ${max}; balance scenes around ${targetSeconds} seconds (default ${def}).`,
    `- Between 1 and ${maxScenes} scenes; every scene advances the story; cover the full story with no overlaps.`,
    '- Respond with ONLY the JSON object. No prose before or after. No code fences.',
  ].join('\n')
}

export async function generateStoryboard(projectId: string, body: zType.infer<typeof StoryboardRequest>): Promise<{ improvedStory: string; scenes: SceneResponseDto[] }> {
  const project = await getProjectOr404(projectId)
  const existing = await db.scene.count({ where: { projectId } })
  if (existing > 0 && body.regenerate !== true) {
    throw new AppError('STATE_CONFLICT', `el proyecto ya tiene ${existing} escenas; usa regenerate=true para reemplazarlas`, {
      projectId,
      hints: ['POST con { "regenerate": true } reemplaza las escenas existentes.'],
    })
  }

  const targetSeconds = body.targetDurationSeconds ?? airshotConfig.scene.default_duration_seconds
  const { provider, name: providerName } = await getLLMProvider()
  const userPayload = JSON.stringify({
    story: project.originalStory,
    title: project.title,
    targetDurationSeconds: targetSeconds,
    sceneDurationRangeSeconds: [airshotConfig.scene.min_duration_seconds, airshotConfig.scene.max_duration_seconds],
    maxScenes: airshotConfig.scene.max_scenes_per_project,
  })
  const parsed = await provider.completeStructured({
    systemPromptEn: storyboardSystemPromptEn(targetSeconds),
    userPayload,
    validate: (value) => StoryboardOutput.safeParse(value).success,
    // sin temperature explícita: la resuelve el registro del proveedor (default_temperature)
  })
  const output = StoryboardOutput.parse(parsed)

  if (output.scenes.length > airshotConfig.scene.max_scenes_per_project) {
    throw new AppError('VALIDATION_ERROR', `el storyboard produce ${output.scenes.length} escenas > scene.max_scenes_per_project=${airshotConfig.scene.max_scenes_per_project}`, { projectId })
  }

  // regeneración: borrar escenas previas + sus assets
  if (existing > 0) {
    const prevScenes = await db.scene.findMany({ where: { projectId } })
    for (const scene of prevScenes) {
      storage.delete(scene.imageBasePath)
      storage.delete(scene.videoClipPath)
      storage.delete(scene.audioPath)
    }
    await db.scene.deleteMany({ where: { projectId } })
  }

  await db.scene.createMany({
    data: output.scenes.map((scene, index) => ({
      id: randomUUID(),
      projectId,
      orderIndex: index,
      originalText: scene.originalText,
      improvedText: scene.improvedText,
      promptEn: scene.promptEn,
      durationSeconds: scene.durationSeconds,
      narrationSource: 'improved',
      status: 'draft',
    })),
  })

  await db.project.update({
    where: { id: projectId },
    data: { improvedStory: output.improvedStory, status: project.status === 'draft' ? 'storyboard_ready' : project.status },
  })

  const rows = await db.scene.findMany({ where: { projectId }, orderBy: { orderIndex: 'asc' } })
  const scenesWithRefs = await Promise.all(rows.map(async (row) => {
    const refs = await db.sceneReference.findMany({ where: { sceneId: row.id } })
    return toSceneResponse(row, refs.map((r) => ({ referenceId: r.referenceId, kind: r.kind as 'subject' | 'environment' })))
  }))
  void providerName
  return { improvedStory: output.improvedStory, scenes: scenesWithRefs }
}
