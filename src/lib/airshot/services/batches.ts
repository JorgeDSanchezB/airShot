// AirShot — services/batches.ts: cola "Generar todo" por proyecto.
// Estado en memoria (un único proceso), ejecución secuencial escena→pasos,
// pausa/reanudación/cancelación entre pasos y errores por escena sin abortar el resto.
// El ejecutor es inyectable para testear la máquina de estados sin proveedores.

import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { logger } from '@/lib/airshot/core/logger'
import { generateSceneAudio, generateSceneImage, generateSceneVideo } from '@/lib/airshot/services/scenes'

export const BATCH_STEPS = ['image', 'audio', 'video'] as const
export type BatchStep = (typeof BATCH_STEPS)[number]
export type BatchStatus = 'running' | 'paused' | 'cancelled' | 'completed'

export type BatchError = { sceneId: string; step: BatchStep; code: string; detail: string }

export type BatchRunDto = {
  id: string
  projectId: string
  steps: BatchStep[]
  regenerate: boolean
  status: BatchStatus
  total: number
  done: number
  skipped: number
  currentSceneId: string | null
  errors: BatchError[]
  startedAt: string
  finishedAt: string | null
}

type InternalRun = BatchRunDto & { cancelled: boolean }

export type BatchExecutor = {
  hasAsset: (sceneId: string, step: BatchStep) => Promise<boolean>
  runStep: (sceneId: string, step: BatchStep) => Promise<void>
}

export type BatchDeps = {
  executor?: BatchExecutor
  loadScenes?: () => Promise<Array<{ id: string }>>
}

const runs = new Map<string, InternalRun>()
const MAX_RETAINED_RUNS = 25

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function snapshot(run: InternalRun): BatchRunDto {
  const { cancelled: _cancelled, ...rest } = run
  return { ...rest, errors: [...run.errors] }
}

function pruneRuns(): void {
  if (runs.size < MAX_RETAINED_RUNS) return
  for (const [id, run] of runs) {
    if (runs.size < MAX_RETAINED_RUNS) break
    if (run.status === 'running' || run.status === 'paused') continue
    runs.delete(id)
  }
}

function normalizeSteps(input: BatchStep[] | undefined): BatchStep[] {
  const requested = new Set(input ?? BATCH_STEPS)
  return BATCH_STEPS.filter((step) => requested.has(step))
}

async function pollVideoUntilSettled(sceneId: string): Promise<void> {
  const deadline = Date.now() + airshotConfig.assembly.job_timeout_seconds * 1000
  while (Date.now() < deadline) {
    const row = await db.scene.findUnique({ where: { id: sceneId }, select: { status: true, lastError: true } })
    if (row === null) throw new AppError('NOT_FOUND', `escena ${sceneId} desapareció durante el batch`, { sceneId })
    if (row.status === 'video_pending') {
      await sleep(airshotConfig.batch.poll_ms)
      continue
    }
    if (row.status === 'failed') {
      throw new AppError('PROVIDER_UNAVAILABLE', row.lastError ?? 'el proveedor de vídeo falló sin detalle', { sceneId })
    }
    return
  }
  throw new AppError('PROVIDER_TIMEOUT', 'el vídeo no terminó dentro del timeout del batch', { sceneId })
}

const defaultExecutor: BatchExecutor = {
  async hasAsset(sceneId, step) {
    const row = await db.scene.findUnique({
      where: { id: sceneId },
      select: { imageBasePath: true, audioPath: true, videoClipPath: true },
    })
    if (row === null) return false
    if (step === 'image') return row.imageBasePath !== null
    if (step === 'audio') return row.audioPath !== null
    return row.videoClipPath !== null
  },
  async runStep(sceneId, step) {
    if (step === 'image') {
      await generateSceneImage(sceneId, {})
      return
    }
    if (step === 'audio') {
      await generateSceneAudio(sceneId, {})
      return
    }
    await generateSceneVideo(sceneId, {})
    await pollVideoUntilSettled(sceneId)
  },
}

const defaultLoadScenes = async (projectId: string) => {
  const scenes = await db.scene.findMany({ where: { projectId }, orderBy: { orderIndex: 'asc' }, select: { id: true } })
  return scenes
}

async function waitWhilePaused(run: InternalRun): Promise<void> {
  while (run.status === 'paused' && !run.cancelled) await sleep(150)
}

async function executeRun(run: InternalRun, sceneIds: string[], executor: BatchExecutor): Promise<void> {
  try {
    for (const sceneId of sceneIds) {
      await waitWhilePaused(run)
      if (run.cancelled) return
      run.currentSceneId = sceneId
      for (const step of run.steps) {
        await waitWhilePaused(run)
        if (run.cancelled) return
        try {
          if (!run.regenerate && (await executor.hasAsset(sceneId, step))) {
            run.skipped += 1
            continue
          }
          await executor.runStep(sceneId, step)
        } catch (err) {
          const problem = err instanceof AppError ? err.problem : null
          run.errors.push({
            sceneId,
            step,
            code: problem?.code ?? 'INTERNAL_ERROR',
            detail: problem?.detail ?? (err instanceof Error ? err.message : String(err)),
          })
          logger.warn('batch.step_failed', { batchId: run.id, sceneId, step, error: problem?.code ?? 'INTERNAL_ERROR' })
          break // siguiente escena: un fallo no debe abortar el resto
        }
      }
      run.done += 1
      if (run.done < run.total) await sleep(airshotConfig.batch.pause_between_ms)
    }
  } catch (err) {
    run.errors.push({
      sceneId: run.currentSceneId ?? 'batch',
      step: run.steps[0] ?? 'image',
      code: 'INTERNAL_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    })
  } finally {
    run.currentSceneId = null
    if (!run.cancelled) {
      run.status = 'completed'
      run.finishedAt = new Date().toISOString()
    }
  }
}

export async function startBatch(
  projectId: string,
  body: { steps?: BatchStep[]; regenerate?: boolean },
  deps: BatchDeps = {},
): Promise<BatchRunDto> {
  const scenes = await (deps.loadScenes ?? (() => defaultLoadScenes(projectId)))()
  if (scenes.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'el proyecto no tiene escenas que generar', { projectId })
  }
  if (scenes.length > airshotConfig.batch.max_scenes) {
    throw new AppError('VALIDATION_ERROR', `el batch admite como máximo ${airshotConfig.batch.max_scenes} escenas`, {
      projectId,
      hints: [`divide el proyecto o sube batch.max_scenes en config`],
    })
  }
  const active = [...runs.values()].find(
    (run) => run.projectId === projectId && (run.status === 'running' || run.status === 'paused'),
  )
  if (active !== undefined) {
    throw new AppError('STATE_CONFLICT', 'ya hay un batch activo para este proyecto', {
      projectId,
      hints: [`batchId=${active.id}`, 'pausa o cancela el batch en curso antes de iniciar otro'],
    })
  }
  const run: InternalRun = {
    id: randomUUID(),
    projectId,
    steps: normalizeSteps(body.steps),
    regenerate: body.regenerate ?? false,
    status: 'running',
    total: scenes.length,
    done: 0,
    skipped: 0,
    currentSceneId: null,
    errors: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    cancelled: false,
  }
  pruneRuns()
  runs.set(run.id, run)
  void executeRun(run, scenes.map((s) => s.id), deps.executor ?? defaultExecutor)
  return snapshot(run)
}

export function getBatchOr404(batchId: string): BatchRunDto {
  const run = runs.get(batchId)
  if (run === undefined) throw new AppError('NOT_FOUND', `batch ${batchId} no encontrado`, { hints: ['los batches viven en memoria: un reinicio los descarta'] })
  return snapshot(run)
}

export function latestBatchForProject(projectId: string): BatchRunDto | null {
  let latest: InternalRun | null = null
  for (const run of runs.values()) {
    if (run.projectId !== projectId) continue
    if (latest === null || run.startedAt > latest.startedAt) latest = run
  }
  return latest === null ? null : snapshot(latest)
}

export function controlBatch(batchId: string, action: 'pause' | 'resume' | 'cancel'): BatchRunDto {
  const run = runs.get(batchId)
  if (run === undefined) throw new AppError('NOT_FOUND', `batch ${batchId} no encontrado`)
  if (action === 'pause') {
    if (run.status !== 'running') throw new AppError('STATE_CONFLICT', 'solo se puede pausar un batch en curso', { hints: [`estado=${run.status}`] })
    run.status = 'paused'
  } else if (action === 'resume') {
    if (run.status !== 'paused') throw new AppError('STATE_CONFLICT', 'solo se puede reanudar un batch pausado', { hints: [`estado=${run.status}`] })
    run.status = 'running'
  } else {
    if (run.status !== 'running' && run.status !== 'paused') {
      throw new AppError('STATE_CONFLICT', 'el batch ya terminó', { hints: [`estado=${run.status}`] })
    }
    run.cancelled = true
    run.status = 'cancelled'
    run.finishedAt = new Date().toISOString()
  }
  return snapshot(run)
}

export function resetBatchRegistryForTests(): void {
  runs.clear()
}
