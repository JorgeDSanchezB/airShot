// AirShot — services/translations.ts
// Doblaje multi-idioma: traducción por escena con el LLM configurado y voz TTS
// por idioma. El texto de origen es el mismo que narra la escena (narrationText →
// improvedText → originalText). Regenerar texto invalida el audio previo.

import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { logger } from '@/lib/airshot/core/logger'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { getLLMProvider, getTTSProvider, withProviderConcurrency } from '@/lib/airshot/infrastructure/providers/factory'
import { getProjectOr404 } from '@/lib/airshot/services/projects'

export type LanguageSummary = {
  language: string
  scenes: number
  audioReady: number
  totalScenes: number
}

export type TranslateResult = {
  language: string
  scenes: number
  provider: string
}

export type LanguageAudioResult = {
  language: string
  generated: number
  failed: number
  audioReady: number
  totalScenes: number
  errors: Array<{ sceneId: string; code: string; detail: string }>
}

function sourceText(scene: { narrationText: string | null; improvedText: string | null; originalText: string }): string {
  return scene.narrationText ?? scene.improvedText ?? scene.originalText
}

const LANGUAGE_RE = /^[a-z]{2}(-[A-Z]{2})?$/

function assertLanguage(language: string): void {
  if (!LANGUAGE_RE.test(language)) {
    throw new AppError('VALIDATION_ERROR', `idioma «${language}» inválido (ISO 639-1, p. ej. en, en-US)`, { field: 'language' })
  }
}

function assertLanguageCount(languages: string[]): void {
  if (languages.length > airshotConfig.translation.max_languages) {
    throw new AppError('VALIDATION_ERROR', `${languages.length} idiomas > translation.max_languages=${airshotConfig.translation.max_languages}`, { field: 'languages' })
  }
}

export async function listLanguages(projectId: string): Promise<{ items: LanguageSummary[]; totalScenes: number }> {
  await getProjectOr404(projectId)
  const totalScenes = await db.scene.count({ where: { projectId } })
  const rows = await db.sceneTranslation.findMany({
    where: { scene: { projectId } },
    select: { language: true, audioPath: true },
  })
  const byLanguage = new Map<string, LanguageSummary>()
  for (const row of rows) {
    const summary = byLanguage.get(row.language) ?? { language: row.language, scenes: 0, audioReady: 0, totalScenes }
    summary.scenes++
    if (row.audioPath !== null) summary.audioReady++
    byLanguage.set(row.language, summary)
  }
  return { items: [...byLanguage.values()].sort((left, right) => left.language.localeCompare(right.language)), totalScenes }
}

export async function translateProject(
  projectId: string,
  body: { languages: string[]; voiceId?: string | null },
): Promise<TranslateResult[]> {
  assertLanguageCount(body.languages)
  await getProjectOr404(projectId)
  const scenes = await db.scene.findMany({ where: { projectId }, orderBy: { orderIndex: 'asc' } })
  if (scenes.length === 0) {
    throw new AppError('ASSEMBLY_INCOMPLETE_SCENES', 'el proyecto no tiene escenas que traducir', { projectId })
  }
  const { provider: llm, name } = await getLLMProvider()
  const results: TranslateResult[] = []
  for (const language of body.languages) {
    let translated = 0
    for (const scene of scenes) {
      const text = sourceText(scene)
      if (text.trim().length === 0) continue
      const parsed = await llm.completeStructured({
        systemPromptEn:
          'You are a professional audiovisual translator for short narration lines. '
          + 'Translate the user text into the requested language preserving tone, intentional ambiguity and approximate length suitable for voice-over. '
          + 'Return JSON {"text": "..."} only.',
        userPayload: JSON.stringify({ language, text }),
        validate: (value) => typeof value === 'object' && value !== null && typeof (value as { text?: unknown }).text === 'string' && (value as { text: string }).text.trim().length > 0,
        temperature: 0.2,
      })
      const nextText = (parsed as { text: string }).text.trim()
      const existing = await db.sceneTranslation.findUnique({ where: { sceneId_language: { sceneId: scene.id, language } } })
      if (existing !== null && existing.text === nextText) {
        translated++
        continue
      }
      if (existing !== null && existing.audioPath !== null) {
        // el audio anterior ya no corresponde al texto nuevo
        storage.delete(existing.audioPath)
      }
      await db.sceneTranslation.upsert({
        where: { sceneId_language: { sceneId: scene.id, language } },
        create: {
          id: randomUUID(),
          sceneId: scene.id,
          language,
          text: nextText,
          voiceId: body.voiceId ?? null,
          status: 'text_ready',
        },
        update: {
          text: nextText,
          audioPath: null,
          audioDurationSeconds: null,
          voiceId: body.voiceId ?? existing?.voiceId ?? null,
          status: 'text_ready',
        },
      })
      translated++
    }
    results.push({ language, scenes: translated, provider: name })
  }
  logger.info('translation.text', { projectId, languages: body.languages, scenes: scenes.length, provider: name })
  return results
}

export async function generateLanguageAudio(
  projectId: string,
  language: string,
  body: { regenerate?: boolean; voiceId?: string | null },
): Promise<LanguageAudioResult> {
  assertLanguage(language)
  const project = await getProjectOr404(projectId)
  const rows = await db.sceneTranslation.findMany({
    where: { language, scene: { projectId } },
    include: { scene: true },
    orderBy: { scene: { orderIndex: 'asc' } },
  })
  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `el proyecto no tiene traducciones para «${language}» (traduce primero el texto)`, { projectId, field: 'language' })
  }
  const totalScenes = await db.scene.count({ where: { projectId } })
  const targets = body.regenerate === true ? rows : rows.filter((row) => row.audioPath === null)
  const errors: LanguageAudioResult['errors'] = []
  let generated = 0
  if (targets.length > 0) {
    const { provider, name } = await getTTSProvider(project.ttsProvider)
    for (const row of targets) {
      const previous = row.audioPath
      try {
        const voiceId = body.voiceId !== undefined && body.voiceId !== null ? body.voiceId : (row.voiceId ?? project.voiceId)
        const result = await withProviderConcurrency(name, () => provider.synthesize({ text: row.text, voiceId, responseFormat: 'wav' }))
        const key = storage.translationAudio(projectId, language, row.sceneId, 'wav')
        storage.save(key, result.audioBytes)
        await db.sceneTranslation.update({
          where: { id: row.id },
          data: {
            audioPath: key,
            audioDurationSeconds: result.durationSeconds,
            voiceId: result.effectiveVoiceId,
            status: 'audio_ready',
          },
        })
        if (previous !== null && previous !== key) storage.delete(previous)
        generated++
      } catch (err) {
        const code = err instanceof AppError ? err.problem.code : 'INTERNAL_ERROR'
        const detail = err instanceof AppError ? err.problem.detail : err instanceof Error ? err.message : String(err)
        errors.push({ sceneId: row.sceneId, code, detail })
        logger.warn('translation.audio_failed', { projectId, language, sceneId: row.sceneId, code, detail })
      }
    }
  }
  const audioReady = await db.sceneTranslation.count({ where: { language, scene: { projectId }, audioPath: { not: null } } })
  logger.info('translation.audio', { projectId, language, generated, failed: errors.length, audioReady, totalScenes })
  return { language, generated, failed: errors.length, audioReady, totalScenes, errors }
}

export async function deleteLanguage(projectId: string, language: string): Promise<{ language: string; deleted: number }> {
  assertLanguage(language)
  await getProjectOr404(projectId)
  const rows = await db.sceneTranslation.findMany({ where: { language, scene: { projectId } }, select: { id: true, audioPath: true } })
  if (rows.length === 0) {
    throw new AppError('NOT_FOUND', `el proyecto no tiene traducciones para «${language}»`, { projectId, field: 'language' })
  }
  for (const row of rows) {
    if (row.audioPath !== null) storage.delete(row.audioPath)
  }
  await db.sceneTranslation.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } })
  logger.info('translation.deleted', { projectId, language, deleted: rows.length })
  return { language, deleted: rows.length }
}
