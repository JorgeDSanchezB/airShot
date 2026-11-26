// AirShot — services/scenes.ts (use cases de escenas)
// Semánticas clave del contrato:
// - assets: POST generate/upload SUSTITUYE el asset previo (huérfano borrado vía storage)
// - *_pending en curso → 409 STATE_CONFLICT en deletes/overwrites
// - lastError se conserva hasta el próximo éxito del mismo paso
// - recovery: cualquier *_pending sin operación activa y stale → failed + snapshot timeout
//   (cubre video_pending asíncrono y image/audio_pending síncronos que murieron con el proceso)

import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import type { Problem } from '@/lib/airshot/core/errors'
import { mapDuration } from '@/lib/airshot/domain/duration-mapper'
import { composeScenePrompt, type ComposerReference } from '@/lib/airshot/domain/prompt-composer'
import { toSceneResponse, toReferenceImages } from '@/lib/airshot/domain/dto'
import type { SceneResponseDto } from '@/lib/airshot/domain/dto'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { getImageProvider, getTTSProvider, getVideoProvider, withProviderConcurrency } from '@/lib/airshot/infrastructure/providers/factory'
import { isSceneJobActive, startSceneVideoJob } from '@/lib/airshot/services/jobs'
import { getProjectOr404 } from '@/lib/airshot/services/projects'
import type { z } from 'zod'
import type {
  GenerateSceneAudioRequest,
  GenerateSceneImageRequest,
  GenerateSceneVideoRequest,
  PatchSceneRequest,
  ReorderScenesRequest,
  SceneReferencesPutRequest,
} from '@/lib/airshot/domain/schemas'
import type { Scene, SceneReference } from '@prisma/client'

const PENDING_STALE_MS = airshotConfig.app.pending_stale_ms // B1: ventana de job perdido (clave de config, no constante propia)

export async function getSceneOr404(id: string): Promise<Scene> {
  const row = await db.scene.findUnique({ where: { id } })
  if (row === null) throw new AppError('NOT_FOUND', `escena ${id} no encontrada`, { sceneId: id })
  return row
}

// Operaciones síncronas en vuelo EN ESTE PROCESO (imagen/audio). Sin esto, un
// proveedor lento (> pending_stale_ms) podría marcarse como huérfano por otra
// petición concurrente. La recuperación entre procesos queda fuera del alcance
// single-process declarado (ver README).
const activeSyncOps = new Set<string>()

function isSceneOperationActive(id: string): boolean {
  return isSceneJobActive(id) || activeSyncOps.has(id)
}

/**
 * Recuperación honesta de estados *_pending huérfanos (B1 generalizado).
 * Un *_pending sin operación activa en este proceso y con updatedAt fuera de
 * app.pending_stale_ms corresponde a una petición/proceso muerto → failed
 * reintentable (PROVIDER_TIMEOUT). Devuelve la fila efectiva a usar.
 */
async function recoverStalePending(id: string): Promise<Scene> {
  const row = await getSceneOr404(id)
  if (!row.status.endsWith('_pending')) return row
  if (isSceneOperationActive(id)) return row
  if (Date.now() - row.updatedAt.getTime() <= PENDING_STALE_MS) return row
  const problem = new AppError(
    'PROVIDER_TIMEOUT',
    `operación ${row.status} perdida (p. ej. reinicio del servidor durante la llamada al proveedor); la escena queda marcada failed-reintentable`,
    { sceneId: id },
  )
  return db.scene.update({ where: { id }, data: { status: 'failed', lastError: problemToColumn(problem.problem) } })
}

/** Tras recoverStalePending, un *_pending restante implica operación activa. */
function assertNoPending(scene: Scene): void {
  if (scene.status.endsWith('_pending')) {
    throw new AppError('STATE_CONFLICT', `hay una operación ${scene.status} en curso`, { sceneId: scene.id })
  }
}

export async function referenceDtos(sceneId: string): Promise<Array<{ referenceId: string; kind: 'subject' | 'environment' }>> {
  const rows = await db.sceneReference.findMany({ where: { sceneId } })
  return rows.map((r: SceneReference) => ({ referenceId: r.referenceId, kind: r.kind as 'subject' | 'environment' }))
}

function problemToColumn(problem: Problem): string {
  return JSON.stringify({ code: problem.code, title: problem.title, detail: problem.detail, retryable: problem.retryable })
}

export async function getScene(id: string): Promise<SceneResponseDto> {
  const row = await recoverStalePending(id)
  return toSceneResponse(row, await referenceDtos(id))
}

export async function patchScene(id: string, body: z.infer<typeof PatchSceneRequest>): Promise<SceneResponseDto> {
  const row = await getSceneOr404(id)
  // validación cruzada del contrato: narrationText solo con narrationSource=custom
  if (body.narrationText !== undefined && body.narrationText !== null) {
    const effectiveSource = body.narrationSource ?? row.narrationSource
    if (effectiveSource !== 'custom') {
      throw new AppError('VALIDATION_ERROR', `narrationText solo se admite con narrationSource=custom (efectivo: ${effectiveSource}) — se rechaza, no se ignora`, {
        sceneId: id, field: 'narrationText',
      })
    }
  }
  if (body.narrationSource === 'custom' && body.narrationText === undefined && row.narrationText === null) {
    throw new AppError('VALIDATION_ERROR', 'narrationSource=custom exige narrationText no nulo', { sceneId: id, field: 'narrationText' })
  }
  const data: Record<string, unknown> = {}
  for (const key of ['durationSeconds', 'promptEn', 'improvedText', 'narrationSource', 'narrationText', 'voiceId'] as const) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      data[key] = (body as Record<string, unknown>)[key]
    }
  }
  if (body.narrationSource === 'custom' && body.narrationText === null) {
    throw new AppError('VALIDATION_ERROR', 'narrationSource=custom exige narrationText no nulo', { sceneId: id, field: 'narrationText' })
  }
  const updated = Object.keys(data).length > 0 ? await db.scene.update({ where: { id }, data: data as Parameters<typeof db.scene.update>[0]['data'] }) : row
  return toSceneResponse(updated, await referenceDtos(id))
}

export async function deleteScene(id: string): Promise<void> {
  const row = await recoverStalePending(id)
  assertNoPending(row)
  storage.delete(row.imageBasePath)
  storage.delete(row.videoClipPath)
  storage.delete(row.audioPath)
  await db.scene.delete({ where: { id } })
  await recompactOrder(row.projectId)
}

async function recompactOrder(projectId: string): Promise<void> {
  const rows = await db.scene.findMany({ where: { projectId }, orderBy: { orderIndex: 'asc' } })
  let next = 0
  for (const row of rows) {
    if (row.orderIndex !== next) {
      await db.scene.update({ where: { id: row.id }, data: { orderIndex: next } })
    }
    next++
  }
}

export async function reorderScenes(projectId: string, body: z.infer<typeof ReorderScenesRequest>): Promise<SceneResponseDto[]> {
  await getProjectOr404(projectId)
  const rows = await db.scene.findMany({ where: { projectId } })
  const existing = new Set(rows.map((r) => r.id))
  const incoming = body.sceneIds
  if (incoming.length !== new Set(incoming).size) {
    throw new AppError('VALIDATION_ERROR', 'sceneIds contiene duplicados (debe ser el set exacto)', { projectId })
  }
  const incomingSet = new Set(incoming)
  const missing = [...existing].filter((id) => !incomingSet.has(id)).length
  const extra = [...incomingSet].filter((id) => !existing.has(id)).length
  if (missing > 0 || extra > 0) {
    throw new AppError('VALIDATION_ERROR', `sceneIds debe ser la totalidad exacta: faltan ${missing}, sobran ${extra}`, { projectId })
  }
  let index = 0
  for (const sceneId of incoming) {
    await db.scene.update({ where: { id: sceneId }, data: { orderIndex: index++ } })
  }
  const updated = await db.scene.findMany({ where: { projectId }, orderBy: { orderIndex: 'asc' } })
  return Promise.all(updated.map(async (row) => toSceneResponse(row, await referenceDtos(row.id))))
}

export async function putSceneReferences(id: string, body: z.infer<typeof SceneReferencesPutRequest>): Promise<SceneResponseDto> {
  const row = await getSceneOr404(id)
  const limitS = airshotConfig.scene_reference.max_subjects_per_scene
  const limitE = airshotConfig.scene_reference.max_environments_per_scene
  const subjects = body.items.filter((i) => i.kind === 'subject')
  const environments = body.items.filter((i) => i.kind === 'environment')
  if (subjects.length > limitS || environments.length > limitE) {
    throw new AppError('VALIDATION_ERROR', `máximo ${limitS} subject(s) y ${limitE} environment(s) por escena`, { sceneId: id })
  }
  const refIds = [...new Set(body.items.map((i) => i.referenceId))]
  const refs = await db.reference.findMany({ where: { id: { in: refIds } } })
  const found = new Map(refs.map((r) => [r.id, r]))
  for (const item of body.items) {
    const ref = found.get(item.referenceId)
    if (ref === undefined) {
      throw new AppError('VALIDATION_ERROR', `referencia ${item.referenceId} inexistente`, { sceneId: id })
    }
    if (ref.libraryScope === 'project' && ref.projectId !== row.projectId) {
      throw new AppError('VALIDATION_ERROR', `referencia ${ref.name} pertenece a otro proyecto (ámbito no visible)`, { sceneId: id })
    }
  }
  await db.sceneReference.deleteMany({ where: { sceneId: id } })
  if (body.items.length > 0) {
    await db.sceneReference.createMany({
      data: body.items.map((item) => ({ id: randomUUID(), sceneId: id, referenceId: item.referenceId, kind: item.kind })),
    })
  }
  return toSceneResponse(row, await referenceDtos(id))
}

// ---------------------------------------------------------------- helpers comunes

async function styleFragmentFor(project: { visualStyleId: string | null }, overrideStyleId?: string): Promise<string | null> {
  const styleId = overrideStyleId ?? project.visualStyleId
  if (styleId === null) return null
  const style = await db.visualStyle.findUnique({ where: { id: styleId } })
  if (style === null) {
    throw new AppError('VALIDATION_ERROR', `styleId ${styleId} no existe`, { field: 'styleId' })
  }
  return style.promptFragmentEn
}

type LoadedReference = {
  referenceId: string
  kind: 'subject' | 'environment'
  name: string
  description: string | null
  attributes: Record<string, unknown>
  level: string
  images: Array<{ storageKey: string; isPrimary: boolean }>
}

async function referencesForScene(sceneId: string): Promise<LoadedReference[]> {
  const assignments = await db.sceneReference.findMany({ where: { sceneId } })
  if (assignments.length === 0) return []
  const rows = await db.reference.findMany({ where: { id: { in: assignments.map((a) => a.referenceId) } } })
  const byId = new Map(rows.map((r) => [r.id, r]))
  const out: LoadedReference[] = []
  for (const a of assignments) {
    const row = byId.get(a.referenceId)
    if (row === undefined) continue
    const images = toReferenceImages(row.referenceImages)
    out.push({
      referenceId: row.id,
      kind: a.kind as 'subject' | 'environment',
      name: row.name,
      description: row.description,
      attributes: JSON.parse(row.attributes || '{}') as Record<string, unknown>,
      level: row.level,
      images: images.map((img) => ({ storageKey: img.storageKey, isPrimary: img.isPrimary })),
    })
  }
  return out
}

function toComposerRefs(loaded: LoadedReference[]): ComposerReference[] {
  return loaded.map((r) => ({
    name: r.name,
    description: r.description,
    attributes: r.attributes,
    level: r.level as ComposerReference['level'],
    kind: r.kind,
    hasImages: r.images.length > 0,
  }))
}

/** Selección de imágenes de referencia según política de nivel (§2.6) y límite del proveedor.
 * M1 (ronda de corrección): presupuesto POR REFERENCIA (basic 1 / advanced 2 / cinematic →
 * límite del proveedor), ordenadas primaria primero, respetando además el tope global
 * reference_image_limit del proveedor. */
function selectRefImages(loaded: LoadedReference[], providerLimit: number): string[] {
  const levelLimitFor = (level: string): number | null => {
    if (level === 'basic') return airshotConfig.reference.level_image_limits.basic
    if (level === 'advanced') return airshotConfig.reference.level_image_limits.advanced
    return null // cinematic: null = hasta el reference_image_limit del proveedor
  }
  const keys: string[] = []
  for (const ref of loaded) {
    if (keys.length >= providerLimit) break
    const cap = Math.min(levelLimitFor(ref.level) ?? providerLimit, providerLimit)
    // primaria primero, luego el resto, hasta el tope del nivel y el presupuesto global
    const ordered = [
      ...(ref.images.some((img) => img.isPrimary) ? ref.images.filter((img) => img.isPrimary) : ref.images.slice(0, 1)),
      ...ref.images.filter((img) => !img.isPrimary),
    ]
    for (const img of ordered.slice(0, cap)) {
      if (keys.length < providerLimit) keys.push(img.storageKey)
    }
  }
  return keys
}

async function persistSceneFailure(id: string, err: unknown): Promise<void> {
  const problem: Problem = err instanceof AppError ? err.problem : new AppError('INTERNAL_ERROR', err instanceof Error ? `${err.name}: ${err.message}` : String(err)).problem
  await db.scene.update({ where: { id }, data: { status: 'failed', lastError: problemToColumn(problem) } }).catch(() => undefined)
}

// ---------------------------------------------------------------- imagen base (síncrono)

export async function generateSceneImage(id: string, body: z.infer<typeof GenerateSceneImageRequest>): Promise<SceneResponseDto> {
  const scene = await recoverStalePending(id)
  assertNoPending(scene)
  const project = await getProjectOr404(scene.projectId)
  const styleFragment = await styleFragmentFor(project, body.styleId)
  const loadedRefs = await referencesForScene(id)
  const prompt = composeScenePrompt({
    promptEn: scene.promptEn ?? scene.improvedText ?? scene.originalText,
    styleFragmentEn: styleFragment,
    references: toComposerRefs(loadedRefs),
  })
  activeSyncOps.add(id)
  await db.scene.update({ where: { id }, data: { status: 'image_pending' } })
  try {
    const { provider, name } = await getImageProvider(body.providerOverride)
    const result = await withProviderConcurrency(name, () =>
      provider.generate({ promptEn: prompt, aspectRatio: '16:9' }),
    )
    const previousImage = scene.imageBasePath
    const key = storage.sceneAsset('image', scene.projectId, id, 'ai', result.format)
    storage.save(key, result.imageBytes)
    await db.scene.update({
      where: { id },
      data: { imageBasePath: key, status: 'image_ready', lastError: null },
    })
    if (previousImage !== null && previousImage !== key) storage.delete(previousImage)
    await db.project.updateMany({ where: { id: scene.projectId, status: 'storyboard_ready' }, data: { status: 'in_production' } })
    return await getScene(id)
  } catch (err) {
    await persistSceneFailure(id, err)
    throw err
  } finally {
    activeSyncOps.delete(id)
  }
}

export async function uploadSceneImage(id: string, file: { buffer: Buffer; ext: string }): Promise<SceneResponseDto> {
  const scene = await recoverStalePending(id)
  assertNoPending(scene)
  const previousImage = scene.imageBasePath
  const key = storage.sceneAsset('image', scene.projectId, id, 'upload', file.ext)
  storage.save(key, file.buffer)
  await db.scene.update({ where: { id }, data: { imageBasePath: key, status: 'image_ready', lastError: null } })
  if (previousImage !== null && previousImage !== key) storage.delete(previousImage)
  await db.project.updateMany({ where: { id: scene.projectId, status: 'storyboard_ready' }, data: { status: 'in_production' } })
  return getScene(id)
}

export async function deleteSceneAsset(id: string, kind: 'image' | 'video' | 'audio'): Promise<void> {
  const scene = await recoverStalePending(id)
  assertNoPending(scene)
  const field = kind === 'image' ? 'imageBasePath' : kind === 'video' ? 'videoClipPath' : 'audioPath'
  const current = (scene as unknown as Record<string, string | null>)[field] ?? null
  if (current !== null) {
    storage.delete(current)
    const data: Record<string, unknown> = { [field]: null }
    if (kind === 'video') data.videoEffectiveSeconds = null
    if (kind === 'audio') data.audioDurationSeconds = null
    await db.scene.update({ where: { id }, data: data as Parameters<typeof db.scene.update>[0]['data'] })
  }
}

// ---------------------------------------------------------------- vídeo (asíncrono, 202)

export async function generateSceneVideo(id: string, body: z.infer<typeof GenerateSceneVideoRequest>): Promise<SceneResponseDto> {
  const scene = await recoverStalePending(id)
  const project = await getProjectOr404(scene.projectId)
  if (scene.imageBasePath === null) {
    throw new AppError('STATE_CONFLICT', 'image-to-video requiere imagen base (imageBasePath null)', {
      sceneId: id,
      hints: ['Genera (POST /scenes/{id}/generate-image) o sube (POST /scenes/{id}/image) la imagen base primero.'],
    })
  }
  assertNoPending(scene)
  const { provider, name } = await getVideoProvider(body.providerOverride, project.videoProvider)
  const caps = provider.capabilities()
  const requested = body.durationSeconds ?? scene.durationSeconds
  const effective = mapDuration(requested, caps)

  const styleFragment = await styleFragmentFor(project)
  const loadedRefs = await referencesForScene(id)
  const prompt = composeScenePrompt({
    promptEn: scene.promptEn ?? scene.improvedText ?? scene.originalText,
    styleFragmentEn: styleFragment,
    references: toComposerRefs(loadedRefs),
  })
  const refAbsPaths = selectRefImages(loadedRefs, caps.referenceImageLimit).map((k) => storage.abs(k))

  await db.scene.update({
    where: { id },
    data: { status: 'video_pending', videoEffectiveSeconds: effective, lastError: null },
  })
  startSceneVideoJob({
    sceneId: id,
    providerName: name,
    promptEn: prompt,
    durationSeconds: effective,
    resolution: project.outputResolution as '720p' | '1080p',
    imageAbsPath: storage.abs(scene.imageBasePath),
    referenceImageAbsPaths: refAbsPaths,
  })
  return getScene(id)
}

// ---------------------------------------------------------------- narración (síncrono)

export function narrationTextFor(scene: Scene): string {
  if (scene.narrationSource === 'custom') {
    if (scene.narrationText === null || scene.narrationText.trim().length === 0) {
      throw new AppError('VALIDATION_ERROR', 'narrationSource=custom exige narrationText no vacío', { sceneId: scene.id, field: 'narrationText' })
    }
    return scene.narrationText
  }
  if (scene.narrationSource === 'original') {
    if (scene.originalText.trim().length === 0) {
      throw new AppError('VALIDATION_ERROR', 'originalText vacío: no hay narración derivable', { sceneId: scene.id })
    }
    return scene.originalText
  }
  // improved: cadena documentada improvedText → originalText
  const text = scene.improvedText ?? scene.originalText
  if (text.trim().length === 0) {
    throw new AppError('VALIDATION_ERROR', 'sin texto de narración derivable (improvedText/originalText vacíos)', { sceneId: scene.id })
  }
  return text
}

export async function generateSceneAudio(id: string, body: z.infer<typeof GenerateSceneAudioRequest>): Promise<SceneResponseDto> {
  const scene = await recoverStalePending(id)
  assertNoPending(scene)
  const project = await getProjectOr404(scene.projectId)
  const text = narrationTextFor(scene)
  const voiceId = body.voiceId !== undefined ? body.voiceId : (scene.voiceId ?? project.voiceId)
  activeSyncOps.add(id)
  await db.scene.update({ where: { id }, data: { status: 'audio_pending' } })
  try {
    const { provider, name } = await getTTSProvider(body.providerOverride, project.ttsProvider)
    const result = await withProviderConcurrency(name, () => provider.synthesize({ text, voiceId, responseFormat: 'wav' }))
    const previousAudio = scene.audioPath
    const ext = 'wav'
    const key = storage.sceneAsset('audio', scene.projectId, id, 'ai', ext)
    storage.save(key, result.audioBytes)
    await db.scene.update({
      where: { id },
      data: { audioPath: key, audioDurationSeconds: result.durationSeconds, status: 'audio_ready', lastError: null },
    })
    if (previousAudio !== null && previousAudio !== key) storage.delete(previousAudio)
    await db.project.updateMany({ where: { id: scene.projectId, status: 'storyboard_ready' }, data: { status: 'in_production' } })
    return getScene(id)
  } catch (err) {
    await persistSceneFailure(id, err)
    throw err
  } finally {
    activeSyncOps.delete(id)
  }
}
