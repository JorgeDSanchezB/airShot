// AirShot — services/jobs.ts (ADR-014: async por operación; §3.4 contrato de sondeo)
// Jobs in-process con registro de actividad: la UI sondea GET /scenes/{id} y
// GET /assemblies/{jobId}. Recuperación honesta: un job que quedó *_pending tras
// un reinicio del servidor se marca failed con snapshot PROVIDER_TIMEOUT al
// leerse (nunca queda colgado en silencio).

import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError, type Problem } from '@/lib/airshot/core/errors'
import { logger } from '@/lib/airshot/core/logger'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { assembleProject } from '@/lib/airshot/infrastructure/assembly'
import type { SubtitleMode } from '@/lib/airshot/infrastructure/assembly'
import { incCounter, observeDurationSeconds } from '@/lib/airshot/core/metrics'
import { getAudioQAProvider, getVideoProvider, withProviderConcurrency } from '@/lib/airshot/infrastructure/providers/factory'
import type { VideoGenerationRequest } from '@/lib/airshot/infrastructure/providers/types'

// ---------------------------------------------------------------- actividad

const activeSceneJobs = new Set<string>()
const activeAssemblyJobs = new Set<string>()

export function isSceneJobActive(sceneId: string): boolean {
  return activeSceneJobs.has(sceneId)
}

export function isAssemblyJobActive(jobId: string): boolean {
  return activeAssemblyJobs.has(jobId)
}

export function listActiveAssemblyJobs(): string[] {
  return [...activeAssemblyJobs]
}

function errorSnapshot(err: unknown): Problem {
  if (err instanceof AppError) return err.problem
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  return new AppError('INTERNAL_ERROR', detail).problem
}

function problemToColumn(problem: Problem): string {
  return JSON.stringify({ code: problem.code, title: problem.title, detail: problem.detail, retryable: problem.retryable })
}

/**
 * B1 (ronda de corrección del árbitro): barrido de jobs huérfanos.
 * Un job pending/running SIN runner activo en este proceso es un job perdido
 * (p. ej. reinicio del servidor durante el ensamblaje) → se marca failed con
 * snapshot PROVIDER_TIMEOUT (reintentable) y se degrada el proyecto.
 * - arranque (ensureBootstrap): barrido total (el set activo está vacío).
 * - creación de job nuevo: barrido solo de los antiguos (> app.pending_stale_ms)
 *   para no competir con un job recién lanzado.
 */
export async function sweepOrphanJobs(opts: { staleOnly: boolean }): Promise<number> {
  const rows = await db.assemblyJob.findMany({ where: { status: { in: ['pending', 'running'] } } })
  let swept = 0
  for (const row of rows) {
    if (activeAssemblyJobs.has(row.id)) continue
    const lastActivity = (row.startedAt ?? row.createdAt).getTime()
    if (opts.staleOnly && Date.now() - lastActivity < airshotConfig.app.pending_stale_ms) continue
    await db.assemblyJob.update({
      where: { id: row.id },
      data: {
        status: 'failed',
        errorMessage: problemToColumn(new AppError('PROVIDER_TIMEOUT', 'job perdido (p. ej. reinicio del servidor durante la operación); marcado failed-reintentable por el barrido de huérfanos', { jobId: row.id }).problem),
        finishedAt: new Date(),
      },
    })
    if (row.jobType === 'assembly') {
      await db.project.updateMany({ where: { id: row.projectId, status: 'assembling' }, data: { status: 'failed' } })
    }
    logger.warn('job.orphan_swept', { jobId: row.id, jobType: row.jobType, projectId: row.projectId, status: row.status })
    swept++
  }
  return swept
}

// ---------------------------------------------------------------- vídeo de escena

export type SceneVideoJob = {
  sceneId: string
  providerName: string
  promptEn: string
  durationSeconds: number
  resolution: '720p' | '1080p'
  imageAbsPath: string | null
  referenceImageAbsPaths: string[]
}

export function startSceneVideoJob(job: SceneVideoJob): void {
  activeSceneJobs.add(job.sceneId)
  logger.info('job.scene_video.started', { sceneId: job.sceneId, provider: job.providerName, durationSeconds: job.durationSeconds })
  void runSceneVideoJob(job)
    .catch((err) => {
      logger.error('job.scene_video.unhandled', { sceneId: job.sceneId, error: err })
    })
    .finally(() => {
      activeSceneJobs.delete(job.sceneId)
    })
}

async function runSceneVideoJob(job: SceneVideoJob): Promise<void> {
  const startedAt = Date.now()
  try {
    const { provider } = await getVideoProvider(job.providerName, null)
    const request: VideoGenerationRequest = {
      sceneId: job.sceneId,
      promptEn: job.promptEn,
      durationSeconds: job.durationSeconds,
      imageAbsPath: job.imageAbsPath,
      referenceImageAbsPaths: job.referenceImageAbsPaths,
      resolution: job.resolution,
    }
    const result = await withProviderConcurrency(job.providerName, () => provider.generate(request))
    const scene = await db.scene.findUnique({ where: { id: job.sceneId } })
    if (scene === null) {
      // escena borrada durante el job: el clip se descarta (huérfano declarado)
      return
    }
    const previousClip = scene.videoClipPath
    const clipKey = storage.sceneAsset('video', scene.projectId, scene.id, 'ai', 'mp4')
    storage.save(clipKey, result.clipBytes)
    await db.scene.update({
      where: { id: scene.id },
      data: {
        videoClipPath: clipKey,
        videoProviderJobId: result.providerJobId,
        videoEffectiveSeconds: result.effectiveDurationSeconds,
        status: 'video_ready',
        lastError: null,
      },
    })
    if (previousClip !== null && previousClip !== clipKey) {
      storage.delete(previousClip)
    }
    await db.project.updateMany({ where: { id: scene.projectId, status: 'storyboard_ready' }, data: { status: 'in_production' } })
    logger.info('job.scene_video.completed', {
      sceneId: job.sceneId,
      provider: job.providerName,
      ms: Date.now() - startedAt,
      effectiveSeconds: result.effectiveDurationSeconds,
    })
    incCounter('jobs_total', { type: 'scene_video', status: 'completed' })
    observeDurationSeconds('job_duration_seconds', (Date.now() - startedAt) / 1000, { type: 'scene_video' })
  } catch (err) {
    const problem = errorSnapshot(err)
    logger.error('job.scene_video.failed', { sceneId: job.sceneId, provider: job.providerName, code: problem.code, detail: problem.detail, ms: Date.now() - startedAt })
    incCounter('jobs_total', { type: 'scene_video', status: 'failed' })
    observeDurationSeconds('job_duration_seconds', (Date.now() - startedAt) / 1000, { type: 'scene_video' })
    await db.scene
      .update({ where: { id: job.sceneId }, data: { status: 'failed', lastError: problemToColumn(problem) } })
      .catch((dbErr: unknown) => logger.error('job.scene_video.persist_failed', { sceneId: job.sceneId, error: dbErr }))
  }
}

// ---------------------------------------------------------------- ensamblaje

export type AssemblyOptions = {
  includeAudio: boolean
  musicVolume: number
  aspect: string
  subtitles: SubtitleMode
  duckMusic: boolean
  coverSceneId: string | null
}

export async function createAssemblyJob(
  projectId: string,
  params: AssemblyOptions,
): Promise<string> {
  // B1: barrer huérfanos antiguos antes de contar «jobs en curso»
  await sweepOrphanJobs({ staleOnly: true })
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (project === null) throw new AppError('NOT_FOUND', `proyecto ${projectId} no encontrado`, { projectId })
  if (airshotConfig.assembly.aspect_ratios[params.aspect] === undefined) {
    throw new AppError('VALIDATION_ERROR', `aspect "${params.aspect}" no está en assembly.aspect_ratios`, { field: 'aspect' })
  }
  const scenes = await db.scene.findMany({ where: { projectId }, orderBy: { orderIndex: 'asc' } })
  if (params.coverSceneId !== null && !scenes.some((s) => s.id === params.coverSceneId)) {
    throw new AppError('VALIDATION_ERROR', `coverSceneId ${params.coverSceneId} no pertenece al proyecto`, { field: 'coverSceneId' })
  }
  const incomplete = scenes.filter(
    (s) => s.videoClipPath === null || (params.includeAudio && airshotConfig.assembly.require_audio && s.audioPath === null),
  )
  if (incomplete.length > 0) {
    throw new AppError('ASSEMBLY_INCOMPLETE_SCENES', `${incomplete.length} escena(s) incompletas (clips de vídeo${params.includeAudio && airshotConfig.assembly.require_audio ? ' o narración' : ''})`, {
      projectId,
      hints: incomplete.slice(0, 8).map((s) => `Escena orderIndex=${s.orderIndex}: ${s.videoClipPath === null ? 'sin clip' : 'sin narración'}`),
    })
  }
  if (scenes.length === 0) {
    throw new AppError('ASSEMBLY_INCOMPLETE_SCENES', 'el proyecto no tiene escenas', { projectId })
  }

  const jobId = randomUUID()
  // count+create+transición en UNA transacción: dos peticiones simultáneas no
  // pueden crear dos jobs activos (la carrera anterior era count-then-create).
  await db.$transaction(async (tx) => {
    const running = await tx.assemblyJob.count({ where: { projectId, jobType: 'assembly', status: { in: ['pending', 'running'] } } })
    if (running > 0) {
      throw new AppError('STATE_CONFLICT', 'ya hay un job de ensamblaje en curso para el proyecto', { projectId })
    }
    await tx.assemblyJob.create({
      data: {
        id: jobId,
        projectId,
        jobType: 'assembly',
        status: 'pending',
        params: JSON.stringify({
          includeAudio: params.includeAudio,
          musicAssetKey: project.musicAssetKey,
          musicVolume: params.musicVolume,
          musicOriginalName: project.musicOriginalName,
          resolution: project.outputResolution,
          aspect: params.aspect,
          subtitles: params.subtitles,
          duckMusic: params.duckMusic,
          coverSceneId: params.coverSceneId,
          fps: airshotConfig.assembly.output_fps,
          codec: airshotConfig.assembly.video_codec,
          sceneIds: scenes.map((s) => s.id),
        }),
      },
    })
    await tx.project.update({ where: { id: projectId }, data: { status: 'assembling' } })
  })

  startAssemblyJobRunner(jobId)
  logger.info('job.assembly.created', { jobId, projectId, scenes: scenes.length, includeAudio: params.includeAudio })
  return jobId
}

function startAssemblyJobRunner(jobId: string): void {
  activeAssemblyJobs.add(jobId)
  void runAssemblyJob(jobId)
    .catch((err) => logger.error('job.assembly.unhandled', { jobId, error: err }))
    .finally(() => activeAssemblyJobs.delete(jobId))
}

async function runAssemblyJob(jobId: string): Promise<void> {
  const startedAt = Date.now()
  const job = await db.assemblyJob.findUnique({ where: { id: jobId } })
  if (job === null) return
  await db.assemblyJob.update({ where: { id: jobId }, data: { status: 'running', startedAt: new Date() } })
  const project = await db.project.findUnique({ where: { id: job.projectId } })
  const scenes = await db.scene.findMany({ where: { projectId: job.projectId }, orderBy: { orderIndex: 'asc' } })
  if (project === null || scenes.length === 0) {
    logger.error('job.assembly.failed', { jobId, projectId: job.projectId, code: 'NOT_FOUND', detail: 'proyecto/escenas desaparecidos durante el job' })
    incCounter('jobs_total', { type: 'assembly', status: 'failed' })
    await db.assemblyJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: problemToColumn(new AppError('NOT_FOUND', 'proyecto/escenas desaparecidos durante el job').problem), finishedAt: new Date() },
    })
    return
  }
  const raw = JSON.parse(job.params) as {
    includeAudio: boolean
    musicAssetKey: string | null
    musicVolume: number
    aspect?: string
    subtitles?: SubtitleMode
    duckMusic?: boolean
    coverSceneId?: string | null
  }
  const outcome = await assembleProject(job.projectId, jobId, scenes.map((s) => ({
    sceneId: s.id,
    videoClipPath: s.videoClipPath ?? '',
    audioPath: s.audioPath,
    durationSeconds: s.durationSeconds,
    subtitleText: s.narrationText ?? s.improvedText ?? s.originalText,
  })), {
    includeAudio: raw.includeAudio,
    musicAssetKey: raw.musicAssetKey,
    musicVolume: raw.musicVolume,
    resolution: project.outputResolution as '720p' | '1080p',
    aspect: raw.aspect ?? '16:9',
    subtitles: raw.subtitles ?? 'none',
    duckMusic: raw.duckMusic ?? false,
    coverSceneId: raw.coverSceneId ?? null,
  }, {
    onProgress: async (progress) => {
      await db.assemblyJob.update({ where: { id: jobId }, data: { progress: JSON.stringify(progress) } })
    },
  })
  if ('outputPath' in outcome) {
    await db.assemblyJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        outputPath: outcome.outputPath,
        subtitlesPath: outcome.subtitlesPath,
        thumbnailPath: outcome.thumbnailPath,
        progress: JSON.stringify({ stage: 'done', done: 1, total: 1 }),
        finishedAt: new Date(),
      },
    })
    await db.project.update({ where: { id: job.projectId }, data: { status: 'assembled' } })
    incCounter('jobs_total', { type: 'assembly', status: 'completed' })
    observeDurationSeconds('job_duration_seconds', (Date.now() - startedAt) / 1000, { type: 'assembly' })
    logger.info('job.assembly.completed', { jobId, projectId: job.projectId, ms: Date.now() - startedAt, outputPath: outcome.outputPath })
  } else {
    await db.assemblyJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: problemToColumn(outcome.problem), finishedAt: new Date() },
    })
    await db.project.update({ where: { id: job.projectId }, data: { status: 'failed' } })
    incCounter('jobs_total', { type: 'assembly', status: 'failed' })
    observeDurationSeconds('job_duration_seconds', (Date.now() - startedAt) / 1000, { type: 'assembly' })
    logger.error('job.assembly.failed', { jobId, projectId: job.projectId, code: outcome.problem.code, detail: outcome.problem.detail, ms: Date.now() - startedAt })
  }
}

// ---------------------------------------------------------------- reintentos

/**
 * Reintento de un job failed: se crea un job NUEVO con los mismos parámetros
 * (los jobs del historial son inmutables). La reanudación real la aporta la
 * caché de segmentos normalizados de assembly.ts: los clips ya normalizados
 * se reutilizan y solo se repite el tramo que falló.
 */
export async function retryAssemblyJob(jobId: string): Promise<string> {
  const job = await db.assemblyJob.findUnique({ where: { id: jobId } })
  if (job === null) throw new AppError('NOT_FOUND', `job ${jobId} no encontrado`, { jobId })
  if (job.status !== 'failed') {
    throw new AppError('STATE_CONFLICT', `solo se reintentan jobs en estado failed (estado actual: ${job.status})`, { jobId })
  }
  const raw = JSON.parse(job.params) as {
    includeAudio?: boolean
    musicVolume?: number
    aspect?: string
    subtitles?: SubtitleMode
    duckMusic?: boolean
    coverSceneId?: string | null
    features?: Array<'naturalness' | 'sync' | 'loudness' | 'artifacts'>
    generateSfx?: boolean
  }
  if (job.jobType === 'assembly') {
    return createAssemblyJob(job.projectId, {
      includeAudio: raw.includeAudio ?? true,
      musicVolume: raw.musicVolume ?? airshotConfig.assembly.music_default_volume,
      aspect: raw.aspect ?? '16:9',
      subtitles: raw.subtitles ?? 'none',
      duckMusic: raw.duckMusic ?? false,
      coverSceneId: raw.coverSceneId ?? null,
    })
  }
  if (job.jobType === 'audio_qa') {
    const features = raw.features ?? ['loudness']
    return createAudioQAJob(job.projectId, features, raw.generateSfx ?? false)
  }
  throw new AppError('VALIDATION_ERROR', `jobType "${job.jobType}" no es reintentable`, { jobId })
}

// ---------------------------------------------------------------- audio-qa (Earshot)

export async function createAudioQAJob(
  projectId: string,
  features: Array<'naturalness' | 'sync' | 'loudness' | 'artifacts'>,
  generateSfx: boolean,
): Promise<string> {
  // B1: barrer huérfanos antiguos antes de contar «jobs en curso»
  await sweepOrphanJobs({ staleOnly: true })
  if (!airshotConfig.audio_qa.earshot.enabled) {
    throw new AppError('STATE_CONFLICT', 'audio_qa.earshot.enabled=false en config.yaml: módulo desactivado (se exige activarlo en config, no por API)', {
      projectId,
      hints: ['Edita config/config.yaml → audio_qa.earshot.enabled: true y reinicia el servidor.'],
    })
  }
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (project === null) throw new AppError('NOT_FOUND', `proyecto ${projectId} no encontrado`, { projectId })
  const jobId = randomUUID()
  await db.$transaction(async (tx) => {
    const running = await tx.assemblyJob.count({ where: { projectId, jobType: 'audio_qa', status: { in: ['pending', 'running'] } } })
    if (running > 0) {
      throw new AppError('STATE_CONFLICT', 'ya hay un job de audio-qa en curso para el proyecto', { projectId })
    }
    await tx.assemblyJob.create({
      data: {
        id: jobId,
        projectId,
        jobType: 'audio_qa',
        status: 'pending',
        params: JSON.stringify({ features, generateSfx }),
      },
    })
  })
  startAudioQAJobRunner(jobId, features, generateSfx)
  logger.info('job.audio_qa.created', { jobId, projectId, features })
  return jobId
}

function startAudioQAJobRunner(jobId: string, features: Array<'naturalness' | 'sync' | 'loudness' | 'artifacts'>, generateSfx: boolean): void {
  activeAssemblyJobs.add(jobId)
  void runAudioQAJob(jobId, features, generateSfx)
    .catch((err) => logger.error('job.audio_qa.unhandled', { jobId, error: err }))
    .finally(() => activeAssemblyJobs.delete(jobId))
}

async function runAudioQAJob(jobId: string, features: Array<'naturalness' | 'sync' | 'loudness' | 'artifacts'>, generateSfx: boolean): Promise<void> {
  const startedAt = Date.now()
  const job = await db.assemblyJob.findUnique({ where: { id: jobId } })
  if (job === null) return
  await db.assemblyJob.update({ where: { id: jobId }, data: { status: 'running', startedAt: new Date() } })
  try {
    const scenes = await db.scene.findMany({ where: { projectId: job.projectId }, orderBy: { orderIndex: 'asc' } })
    const entries: Array<{ assetKey: string; absPath: string; kind: 'narration' | 'music' | 'mix' }> = []
    for (const scene of scenes) {
      if (scene.audioPath !== null) {
        entries.push({ assetKey: scene.audioPath, absPath: storage.abs(scene.audioPath), kind: 'narration' })
      }
    }
    const project = await db.project.findUnique({ where: { id: job.projectId } })
    if (project?.musicAssetKey !== null && project !== null && project.musicAssetKey !== null) {
      entries.push({ assetKey: project.musicAssetKey, absPath: storage.abs(project.musicAssetKey), kind: 'music' })
    }
    if (entries.length === 0) {
      throw new AppError('STATE_CONFLICT', 'no hay pistas de narración ni música para analizar', { projectId: job.projectId })
    }
    const { provider } = getAudioQAProvider()
    const report = await provider.analyze({ assetEntries: entries, features, generateSfx })
    const reportKey = storage.reportOutput(job.projectId, jobId)
    storage.save(reportKey, Buffer.from(JSON.stringify({ jobId, projectId: job.projectId, features, generateSfx, ...report }, null, 2), 'utf8'))
    await db.assemblyJob.update({
      where: { id: jobId },
      data: { status: 'completed', outputPath: reportKey, report: JSON.stringify(report), finishedAt: new Date() },
    })
    logger.info('job.audio_qa.completed', { jobId, projectId: job.projectId, ms: Date.now() - startedAt })
    incCounter('jobs_total', { type: 'audio_qa', status: 'completed' })
    observeDurationSeconds('job_duration_seconds', (Date.now() - startedAt) / 1000, { type: 'audio_qa' })
  } catch (err) {
    const problem = errorSnapshot(err)
    logger.error('job.audio_qa.failed', { jobId, projectId: job.projectId, code: problem.code, detail: problem.detail, ms: Date.now() - startedAt })
    incCounter('jobs_total', { type: 'audio_qa', status: 'failed' })
    observeDurationSeconds('job_duration_seconds', (Date.now() - startedAt) / 1000, { type: 'audio_qa' })
    await db.assemblyJob.update({
      where: { id: jobId },
      data: { status: 'failed', errorMessage: problemToColumn(problem), finishedAt: new Date() },
    })
  }
}
