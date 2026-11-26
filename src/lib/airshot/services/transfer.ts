// AirShot — services/transfer.ts
// Exportación/importación de proyectos como archivo .airshot (zip STORE con
// project.json + media/). El import crea ids y claves NUEVOS: nunca se reutilizan
// rutas del archivo, así un paquete manipulado no puede escribir fuera de data.root.

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/lib/db'
import { airshotConfig, listProviderNames } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { logger } from '@/lib/airshot/core/logger'
import { toReferenceImages } from '@/lib/airshot/domain/dto'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { buildZip, readZip } from '@/lib/airshot/infrastructure/zip'

export type TransferExportResult = {
  key: string
  url: string
  sizeBytes: number
  format: 'airshot-project/1'
  includesMedia: boolean
  scenes: number
  references: number
  mediaFiles: number
}

export type TransferImportResult = {
  projectId: string
  title: string
  scenes: number
  references: number
  mediaFiles: number
  warnings: string[]
}

const TransferScene = z.object({
  orderIndex: z.number().int().min(0),
  originalText: z.string().min(1),
  improvedText: z.string().nullable(),
  promptEn: z.string().nullable(),
  durationSeconds: z.number().int().positive(),
  seed: z.number().int().nullable(),
  trimStartSeconds: z.number().nullable(),
  trimEndSeconds: z.number().nullable(),
  narrationSource: z.string(),
  narrationText: z.string().nullable(),
  voiceId: z.string().nullable(),
  imageKey: z.string().nullable(),
  videoKey: z.string().nullable(),
  audioKey: z.string().nullable(),
  audioDurationSeconds: z.number().nullable(),
  videoEffectiveSeconds: z.number().nullable(),
  referenceKeys: z.array(z.object({ key: z.string().min(1), kind: z.enum(['subject', 'environment']) })),
})

const TransferReference = z.object({
  key: z.string().min(1),
  type: z.enum(['character', 'location']),
  name: z.string().min(1),
  description: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()),
  level: z.enum(['basic', 'advanced', 'cinematic']),
  images: z.array(z.object({ key: z.string(), isPrimary: z.boolean(), source: z.enum(['upload', 'ai']) })),
})

const TransferFile = z.object({
  format: z.literal('airshot-project/1'),
  exportedAt: z.string(),
  app: z.string(),
  project: z.object({
    title: z.string().min(1),
    originalStory: z.string(),
    improvedStory: z.string().nullable(),
    outputFormat: z.string(),
    outputResolution: z.string(),
    videoProvider: z.string().nullable(),
    ttsProvider: z.string().nullable(),
    voiceId: z.string().nullable(),
    visualSeed: z.number().int().nullable(),
    musicVolume: z.number(),
    status: z.string(),
    music: z.object({ key: z.string(), originalName: z.string().nullable(), durationSeconds: z.number().nullable() }).nullable(),
  }),
  style: z.object({ name: z.string().min(1), description: z.string().nullable(), promptFragmentEn: z.string().min(1) }).nullable(),
  scenes: z.array(TransferScene),
  references: z.array(TransferReference),
})

type TransferFileData = z.infer<typeof TransferFile>

function extOf(key: string): string {
  const dot = key.lastIndexOf('.')
  return dot >= 0 ? key.slice(dot + 1) : 'bin'
}

function parseJsonLoose<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------- export

export async function exportProject(projectId: string, opts: { includeMedia?: boolean } = {}): Promise<TransferExportResult> {
  const project = await db.project.findUnique({ where: { id: projectId }, include: { visualStyle: true } })
  if (project === null) throw new AppError('NOT_FOUND', `proyecto ${projectId} no encontrado`)
  const includeMedia = opts.includeMedia ?? airshotConfig.transfer.include_media_default
  const [scenes, references] = await Promise.all([
    db.scene.findMany({ where: { projectId }, orderBy: { orderIndex: 'asc' }, include: { references: true } }),
    db.reference.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } }),
  ])

  const media = new Map<string, Buffer>()
  const takeMedia = (key: string | null): string | null => {
    if (!includeMedia || key === null || !storage.exists(key)) return null
    if (!media.has(key)) {
      try {
        media.set(key, storage.open(key))
      } catch {
        logger.warn('transfer.export_media_unreadable', { projectId, key })
        return null
      }
    }
    return key
  }

  const refKeyById = new Map(references.map((row, index) => [row.id, `r${index + 1}`]))
  const musicKey = takeMedia(project.musicAssetKey)

  const file: TransferFileData = {
    format: 'airshot-project/1',
    exportedAt: new Date().toISOString(),
    app: 'airshot',
    project: {
      title: project.title,
      originalStory: project.originalStory,
      improvedStory: project.improvedStory,
      outputFormat: project.outputFormat,
      outputResolution: project.outputResolution,
      videoProvider: project.videoProvider,
      ttsProvider: project.ttsProvider,
      voiceId: project.voiceId,
      visualSeed: project.visualSeed,
      musicVolume: project.musicVolume,
      status: project.status,
      music: musicKey === null
        ? null
        : {
            key: musicKey,
            originalName: project.musicOriginalName,
            durationSeconds: project.musicDurationSeconds,
          },
    },
    style: project.visualStyle === null
      ? null
      : {
          name: project.visualStyle.name,
          description: project.visualStyle.description,
          promptFragmentEn: project.visualStyle.promptFragmentEn,
        },
    scenes: scenes.map((scene) => ({
      orderIndex: scene.orderIndex,
      originalText: scene.originalText,
      improvedText: scene.improvedText,
      promptEn: scene.promptEn,
      durationSeconds: scene.durationSeconds,
      seed: scene.seed,
      trimStartSeconds: scene.trimStartSeconds,
      trimEndSeconds: scene.trimEndSeconds,
      narrationSource: scene.narrationSource,
      narrationText: scene.narrationText,
      voiceId: scene.voiceId,
      imageKey: takeMedia(scene.imageBasePath),
      videoKey: takeMedia(scene.videoClipPath),
      audioKey: takeMedia(scene.audioPath),
      audioDurationSeconds: scene.audioDurationSeconds,
      videoEffectiveSeconds: scene.videoEffectiveSeconds,
      referenceKeys: scene.references
        .map((edge) => {
          const key = refKeyById.get(edge.referenceId)
          return key === undefined ? null : { key, kind: edge.kind === 'environment' ? 'environment' as const : 'subject' as const }
        })
        .filter((link): link is { key: string; kind: 'subject' | 'environment' } => link !== null),
    })),
    references: references.map((row, index) => ({
      key: `r${index + 1}`,
      type: row.type === 'location' ? 'location' : 'character',
      name: row.name,
      description: row.description,
      attributes: parseJsonLoose<Record<string, unknown>>(row.attributes, {}),
      level: row.level === 'advanced' || row.level === 'cinematic' ? row.level : 'basic',
      images: toReferenceImages(row.referenceImages).map((image) => ({
        key: image.storageKey,
        isPrimary: image.isPrimary,
        source: image.source,
      })),
    })),
  }

  for (const reference of file.references) {
    reference.images = reference.images
      .map((image) => {
        const kept = takeMedia(image.key)
        return kept === null ? null : { ...image, key: kept }
      })
      .filter((image): image is { key: string; isPrimary: boolean; source: 'upload' | 'ai' } => image !== null)
  }

  const entries = [
    { name: 'project.json', data: Buffer.from(JSON.stringify(file, null, 2), 'utf8') },
    ...[...media.entries()].map(([key, data]) => ({ name: `media/${key}`, data })),
  ]
  const archive = buildZip(entries)
  const key = storage.projectExport(projectId)
  storage.save(key, archive)
  logger.info('transfer.export', { projectId, scenes: scenes.length, references: references.length, mediaFiles: media.size, bytes: archive.length })
  return {
    key,
    url: storage.resolveUrl(key) ?? '',
    sizeBytes: archive.length,
    format: 'airshot-project/1',
    includesMedia: includeMedia,
    scenes: scenes.length,
    references: references.length,
    mediaFiles: media.size,
  }
}

// ---------------------------------------------------------------- import

export async function importProject(archive: Buffer): Promise<TransferImportResult> {
  if (archive.length > airshotConfig.transfer.max_archive_bytes) {
    throw new AppError('PAYLOAD_TOO_LARGE', `el .airshot (${archive.length} bytes) supera transfer.max_archive_bytes=${airshotConfig.transfer.max_archive_bytes}`)
  }
  let entries
  try {
    entries = readZip(archive)
  } catch (err) {
    throw new AppError('VALIDATION_ERROR', `archivo .airshot inválido: ${err instanceof Error ? err.message : String(err)}`)
  }
  const fileEntry = entries.find((entry) => entry.name === 'project.json')
  if (fileEntry === undefined) {
    throw new AppError('VALIDATION_ERROR', 'el archivo no contiene project.json (¿realmente es un .airshot?)')
  }
  let file: TransferFileData
  try {
    file = TransferFile.parse(JSON.parse(fileEntry.data.toString('utf8')))
  } catch (err) {
    throw new AppError('VALIDATION_ERROR', `project.json inválido: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (file.scenes.length > airshotConfig.scene.max_scenes_per_project) {
    throw new AppError('VALIDATION_ERROR', `el archivo trae ${file.scenes.length} escenas > scene.max_scenes_per_project=${airshotConfig.scene.max_scenes_per_project}`)
  }
  // invariante: un solo orden por proyecto
  const orders = new Set(file.scenes.map((scene) => scene.orderIndex))
  if (orders.size !== file.scenes.length) throw new AppError('VALIDATION_ERROR', 'orderIndex duplicado entre escenas')
  const refKeys = new Set(file.references.map((reference) => reference.key))
  if (refKeys.size !== file.references.length) throw new AppError('VALIDATION_ERROR', 'clave de referencia duplicada en el archivo')

  const media = new Map<string, Buffer>(
    entries
      .filter((entry) => entry.name.startsWith('media/'))
      .map((entry): [string, Buffer] => [entry.name.slice('media/'.length), entry.data]),
  )
  const warnings: string[] = []

  const videoProviders = listProviderNames('video')
  const ttsProviders = listProviderNames('tts')
  let videoProvider = file.project.videoProvider
  if (videoProvider !== null && !videoProviders.includes(videoProvider)) {
    warnings.push(`proveedor de vídeo «${videoProvider}» no registrado → null`)
    videoProvider = null
  }
  let ttsProvider = file.project.ttsProvider
  if (ttsProvider !== null && !ttsProviders.includes(ttsProvider)) {
    warnings.push(`proveedor TTS «${ttsProvider}» no registrado → null`)
    ttsProvider = null
  }

  let visualStyleId: string | null = null
  if (file.style !== null) {
    const existing = await db.visualStyle.findUnique({ where: { name: file.style.name } })
    visualStyleId = existing !== null
      ? existing.id
      : (await db.visualStyle.create({
          data: {
            id: randomUUID(),
            name: file.style.name,
            description: file.style.description,
            promptFragmentEn: file.style.promptFragmentEn,
            isCustom: true,
          },
        })).id
  }

  const projectId = randomUUID()
  let mediaFiles = 0
  const writeMedia = (key: string | null, makeKey: (ext: string) => string): string | null => {
    if (key === null) return null
    const data = media.get(key)
    if (data === undefined) {
      warnings.push(`media «${key}» ausente en el archivo → campo vacío`)
      return null
    }
    const newKey = makeKey(extOf(key))
    storage.save(newKey, data)
    mediaFiles++
    return newKey
  }

  const music = file.project.music !== null
    ? {
        key: writeMedia(file.project.music.key, (ext) => storage.musicAsset(projectId, ext)),
        originalName: file.project.music.originalName,
        durationSeconds: file.project.music.durationSeconds,
      }
    : null

  const referencePlans = file.references.map((reference) => {
    const id = randomUUID()
    const images = reference.images.map((image) => ({ ...image, storageKey: writeMedia(image.key, (ext) => storage.referenceImage(id, image.source, ext)) }))
    const usable = images.filter((image): image is { key: string; isPrimary: boolean; source: 'upload' | 'ai'; storageKey: string } => image.storageKey !== null)
    if (usable.length > 0 && !usable.some((image) => image.isPrimary)) usable[0].isPrimary = true
    return { id, reference, usable }
  })
  const refIdByKey = new Map(referencePlans.map((plan) => [plan.reference.key, plan.id]))

  const scenePlans = file.scenes.map((scene) => {
    const id = randomUUID()
    const { min_duration_seconds: min, max_duration_seconds: max } = airshotConfig.scene
    const duration = Math.min(Math.max(scene.durationSeconds, min), max)
    if (duration !== scene.durationSeconds) warnings.push(`escena ${scene.orderIndex + 1}: duración ${scene.durationSeconds}s ajustada a ${duration}s`)
    return {
      id,
      scene,
      duration,
      imageKey: writeMedia(scene.imageKey, (ext) => storage.sceneAsset('image', projectId, id, 'upload', ext)),
      videoKey: writeMedia(scene.videoKey, (ext) => storage.sceneAsset('video', projectId, id, 'upload', ext)),
      audioKey: writeMedia(scene.audioKey, (ext) => storage.sceneAsset('audio', projectId, id, 'upload', ext)),
      referenceLinks: scene.referenceKeys.flatMap((link) => {
        const referenceId = refIdByKey.get(link.key)
        return referenceId === undefined ? [] : [{ referenceId, kind: link.kind }]
      }),
    }
  })

  await db.$transaction(async (tx) => {
    await tx.project.create({
      data: {
        id: projectId,
        title: file.project.title,
        originalStory: file.project.originalStory,
        improvedStory: file.project.improvedStory,
        status: file.project.status,
        visualStyleId,
        videoProvider,
        ttsProvider,
        outputFormat: file.project.outputFormat,
        outputResolution: file.project.outputResolution,
        voiceId: file.project.voiceId,
        visualSeed: file.project.visualSeed,
        musicVolume: file.project.musicVolume,
        musicAssetKey: music?.key ?? null,
        musicOriginalName: music?.originalName ?? null,
        musicDurationSeconds: music?.durationSeconds ?? null,
      },
    })
    for (const plan of referencePlans) {
      await tx.reference.create({
        data: {
          id: plan.id,
          projectId,
          type: plan.reference.type,
          name: plan.reference.name,
          description: plan.reference.description,
          attributes: JSON.stringify(plan.reference.attributes),
          referenceImages: JSON.stringify(plan.usable.map((image) => ({
            id: randomUUID(),
            storageKey: image.storageKey,
            isPrimary: image.isPrimary,
            source: image.source,
            createdAt: new Date().toISOString(),
          }))),
          libraryScope: 'project',
          level: plan.reference.level,
          attributesSchemaVersion: 'v1',
        },
      })
    }
    for (const plan of scenePlans) {
      await tx.scene.create({
        data: {
          id: plan.id,
          projectId,
          orderIndex: plan.scene.orderIndex,
          originalText: plan.scene.originalText,
          improvedText: plan.scene.improvedText,
          promptEn: plan.scene.promptEn,
          durationSeconds: plan.duration,
          seed: plan.scene.seed,
          trimStartSeconds: plan.scene.trimStartSeconds,
          trimEndSeconds: plan.scene.trimEndSeconds,
          narrationSource: plan.scene.narrationSource,
          narrationText: plan.scene.narrationText,
          voiceId: plan.scene.voiceId,
          imageBasePath: plan.imageKey,
          videoClipPath: plan.videoKey,
          audioPath: plan.audioKey,
          videoEffectiveSeconds: plan.scene.videoEffectiveSeconds,
          audioDurationSeconds: plan.scene.audioDurationSeconds,
          status: plan.videoKey !== null ? 'video_ready' : plan.imageKey !== null ? 'image_ready' : plan.audioKey !== null ? 'audio_ready' : 'draft',
        },
      })
      for (const link of plan.referenceLinks) {
        await tx.sceneReference.create({
          data: { id: randomUUID(), sceneId: plan.id, referenceId: link.referenceId, kind: link.kind },
        })
      }
    }
  })

  logger.info('transfer.import', {
    projectId,
    scenes: scenePlans.length,
    references: referencePlans.length,
    mediaFiles,
    warnings: warnings.length,
  })
  return {
    projectId,
    title: file.project.title,
    scenes: scenePlans.length,
    references: referencePlans.length,
    mediaFiles,
    warnings,
  }
}
