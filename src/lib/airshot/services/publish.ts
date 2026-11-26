// AirShot — services/publish.ts
// Paquete de publicación: reúne los ensamblajes completados (un vídeo por aspecto),
// subtítulos, portada, manifiesto y metadata de publicación (LLM o plantilla honesta).
// No re-renderiza: publica lo que ya existe; si falta un vídeo completado, 409 con hint.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '@/lib/db'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { logger } from '@/lib/airshot/core/logger'
import { getLLMProvider } from '@/lib/airshot/infrastructure/providers/factory'
import { makeTempDir, runFfmpeg } from '@/lib/airshot/infrastructure/ffmpeg'
import { buildZip, type ZipEntry } from '@/lib/airshot/infrastructure/zip'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { getProjectOr404 } from '@/lib/airshot/services/projects'

export type PublishMetadata = {
  source: 'llm' | 'template'
  title: string
  description: string
  hashtags: string[]
}

export type PublishResult = {
  key: string
  url: string
  sizeBytes: number
  aspects: string[]
  metadata: PublishMetadata
  createdAt: string
}

type JobParams = { aspect?: string; subtitles?: string; resolution?: string }

function parseParams(raw: string): JobParams {
  try {
    return JSON.parse(raw) as JobParams
  } catch {
    return {}
  }
}

function templateMetadata(title: string, descriptionSource: string): PublishMetadata {
  const words = descriptionSource
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5)
  const hashtags = [...new Set(words)].slice(0, 6)
  return {
    source: 'template',
    title: title.slice(0, 100),
    description: descriptionSource.replace(/\s+/g, ' ').trim().slice(0, 280),
    hashtags,
  }
}

function saneMetadata(value: unknown, title: string, descriptionSource: string): PublishMetadata {
  if (typeof value !== 'object' || value === null) return templateMetadata(title, descriptionSource)
  const candidate = value as Record<string, unknown>
  const titleOut = typeof candidate.title === 'string' && candidate.title.trim().length > 0 ? candidate.title.trim().slice(0, 100) : title.slice(0, 100)
  const description = typeof candidate.description === 'string' && candidate.description.trim().length > 0
    ? candidate.description.trim().slice(0, 600)
    : descriptionSource.replace(/\s+/g, ' ').trim().slice(0, 280)
  const hashtags = Array.isArray(candidate.hashtags)
    ? candidate.hashtags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.replace(/^#/, '').trim()).filter((tag) => tag.length > 0).slice(0, 10)
    : []
  return { source: 'llm', title: titleOut, description, hashtags }
}

async function generateMetadata(projectTitle: string, story: string, scenes: Array<{ orderIndex: number; text: string }>): Promise<PublishMetadata> {
  const fallback = templateMetadata(projectTitle, story)
  try {
    const { provider } = await getLLMProvider()
    const raw = await provider.completeStructured({
      systemPromptEn:
        'You are a short-form video publisher. Reply with JSON only: {"title": string (max 90 chars, punchy), "description": string (max 280 chars, engaging, no hashtags inline), "hashtags": string[] (max 8, lowercase, without #)}. Use the project language.',
      userPayload: JSON.stringify({ title: projectTitle, story, scenes }),
      temperature: 0.6,
      validate: (value) => {
        if (typeof value !== 'object' || value === null) return false
        const record = value as Record<string, unknown>
        return typeof record.title === 'string' && typeof record.description === 'string' && Array.isArray(record.hashtags)
      },
    })
    return saneMetadata(raw, projectTitle, story)
  } catch (err) {
    logger.warn('publish.metadata_fallback', { error: err instanceof Error ? err.message : String(err) })
    return fallback
  }
}

async function extractCover(videoKey: string): Promise<Buffer | null> {
  const temp = makeTempDir('publish-cover')
  try {
    const out = join(temp.dir, 'cover.jpg')
    await runFfmpeg(['-y', '-i', storage.abs(videoKey), '-frames:v', '1', '-q:v', '3', out], 'publish-cover')
    return readFileSync(out)
  } catch (err) {
    logger.warn('publish.cover_failed', { error: err instanceof Error ? err.message : String(err) })
    return null
  } finally {
    temp.cleanup()
  }
}

function safeAspect(aspect: string): string {
  return aspect.replace(/[^0-9a-zA-Z]+/g, '-')
}

export async function buildPublishPackage(projectId: string, options: { metadata?: boolean } = {}): Promise<PublishResult> {
  const project = await getProjectOr404(projectId)
  const scenes = await db.scene.findMany({ where: { projectId }, orderBy: { orderIndex: 'asc' } })
  const jobs = await db.assemblyJob.findMany({
    where: { projectId, jobType: 'assembly', status: 'completed' },
    orderBy: { finishedAt: 'desc' },
  })
  // último job completado por aspecto (los videos existen aunque se hayan re-ensamblado)
  const latestByAspect = new Map<string, (typeof jobs)[number]>()
  for (const job of jobs) {
    if (job.outputPath === null || !storage.exists(job.outputPath)) continue
    const aspect = parseParams(job.params).aspect ?? '16:9'
    if (!latestByAspect.has(aspect)) latestByAspect.set(aspect, job)
  }
  if (latestByAspect.size === 0) {
    throw new AppError('STATE_CONFLICT', 'no hay ensamblajes completados con archivo de salida', {
      projectId,
      hints: ['Ensambla el proyecto (POST /projects/{id}/assemble) y espera el estado completed antes de publicar.'],
    })
  }

  const entries: ZipEntry[] = []
  const manifestAspects: Array<{ aspect: string; jobId: string; resolution: string | null; subtitles: string | null }> = []
  for (const [aspect, job] of latestByAspect) {
    const params = parseParams(job.params)
    entries.push({ name: `video_${safeAspect(aspect)}.mp4`, data: storage.open(job.outputPath as string) })
    if (job.subtitlesPath !== null && storage.exists(job.subtitlesPath)) {
      entries.push({ name: `subtitles_${safeAspect(aspect)}.srt`, data: storage.open(job.subtitlesPath) })
    }
    manifestAspects.push({ aspect, jobId: job.id, resolution: params.resolution ?? project.outputResolution, subtitles: params.subtitles ?? null })
  }

  const coverJob = [...latestByAspect.values()][0]
  let cover: Buffer | null = coverJob !== undefined && coverJob.thumbnailPath !== null && storage.exists(coverJob.thumbnailPath)
    ? storage.open(coverJob.thumbnailPath)
    : null
  if (cover === null && coverJob?.outputPath !== null && coverJob?.outputPath !== undefined) {
    cover = await extractCover(coverJob.outputPath)
  }
  if (cover !== null) entries.push({ name: 'cover.jpg', data: cover })

  const metadata = options.metadata === false
    ? templateMetadata(project.title, project.improvedStory ?? project.originalStory)
    : await generateMetadata(project.title, project.improvedStory ?? project.originalStory, scenes.map((scene) => ({
        orderIndex: scene.orderIndex,
        text: scene.narrationText ?? scene.improvedText ?? scene.originalText,
      })))
  entries.push({ name: 'metadata.json', data: Buffer.from(JSON.stringify(metadata, null, 2), 'utf8') })

  const createdAt = new Date().toISOString()
  const manifest = {
    format: 'airshot-publish/1',
    createdAt,
    project: {
      id: project.id,
      title: project.title,
      videoProvider: project.videoProvider,
      ttsProvider: project.ttsProvider,
      resolution: project.outputResolution,
      visualSeed: project.visualSeed,
      style: project.visualStyleId,
    },
    assembly: { fps: airshotConfig.assembly.output_fps, codec: airshotConfig.assembly.video_codec, crf: airshotConfig.assembly.video_crf },
    aspects: manifestAspects,
    scenes: scenes.map((scene) => ({
      orderIndex: scene.orderIndex,
      durationSeconds: scene.durationSeconds,
      trimStartSeconds: scene.trimStartSeconds,
      trimEndSeconds: scene.trimEndSeconds,
      narration: scene.narrationText ?? scene.improvedText ?? scene.originalText,
      seed: scene.seed,
    })),
  }
  entries.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8') })
  entries.push({
    name: 'README.txt',
    data: Buffer.from(
      [
        `AirShot — paquete de publicación: ${project.title}`,
        `Generado: ${createdAt}`,
        '',
        'Contenido:',
        ...[...latestByAspect.keys()].map((aspect) => `- video_${safeAspect(aspect)}.mp4 (aspecto ${aspect})`),
        '- subtitles_*.srt (si el ensamblaje los generó)',
        '- cover.jpg (si hay portada o fotograma extraíble)',
        '- metadata.json (título/descripción/hashtags; source indica LLM o plantilla)',
        '- manifest.json (trazabilidad completa de escenas y jobs)',
      ].join('\n'),
      'utf8',
    ),
  })

  const zip = buildZip(entries)
  const key = storage.packageZip(projectId)
  storage.save(key, zip)
  logger.info('publish.package', { projectId, sizeBytes: zip.length, aspects: [...latestByAspect.keys()], metadataSource: metadata.source })
  return {
    key,
    url: storage.resolveUrl(key) as string,
    sizeBytes: zip.length,
    aspects: [...latestByAspect.keys()],
    metadata,
    createdAt,
  }
}
