import { beforeEach, describe, expect, it } from 'vitest'
import {
  controlBatch,
  getBatchOr404,
  resetBatchRegistryForTests,
  startBatch,
  type BatchExecutor,
} from '@/lib/airshot/services/batches'

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await sleep(25)
  }
  throw new Error('waitFor: condición no alcanzada a tiempo')
}

const twoScenes = async () => [{ id: 'scene-a' }, { id: 'scene-b' }]

describe('batch machine', () => {
  beforeEach(() => {
    resetBatchRegistryForTests()
  })

  it('pausa entre escenas y reanuda hasta completar', async () => {
    const entered = deferred()
    const release = deferred()
    const calls: string[] = []
    const executor: BatchExecutor = {
      hasAsset: async () => false,
      runStep: async (sceneId) => {
        calls.push(sceneId)
        if (sceneId === 'scene-a') {
          entered.resolve()
          await release.promise
        }
      },
    }

    const run = await startBatch('project-1', { steps: ['image'] }, { loadScenes: twoScenes, executor })
    await entered.promise

    expect(controlBatch(run.id, 'pause').status).toBe('paused')
    release.resolve()

    await waitFor(() => getBatchOr404(run.id).done === 1)
    await sleep(250)
    expect(calls).toEqual(['scene-a'])
    expect(getBatchOr404(run.id).status).toBe('paused')

    expect(controlBatch(run.id, 'resume').status).toBe('running')
    await waitFor(() => getBatchOr404(run.id).status === 'completed')
    expect(calls).toEqual(['scene-a', 'scene-b'])
    expect(getBatchOr404(run.id)).toMatchObject({ done: 2, total: 2, skipped: 0, errors: [] })
  })

  it('omite pasos con asset existente salvo regenerate', async () => {
    const calls: string[] = []
    const executor: BatchExecutor = {
      hasAsset: async (sceneId, step) => sceneId === 'scene-a' && step === 'image',
      runStep: async (sceneId, step) => {
        calls.push(`${sceneId}:${step}`)
      },
    }

    const run = await startBatch('project-2', { steps: ['image'] }, { loadScenes: twoScenes, executor })
    await waitFor(() => getBatchOr404(run.id).status === 'completed')
    expect(calls).toEqual(['scene-b:image'])
    expect(getBatchOr404(run.id).skipped).toBe(1)

    resetBatchRegistryForTests()
    const forced = await startBatch('project-2', { steps: ['image'], regenerate: true }, { loadScenes: twoScenes, executor })
    await waitFor(() => getBatchOr404(forced.id).status === 'completed')
    expect(calls).toEqual(['scene-b:image', 'scene-a:image', 'scene-b:image'])
    expect(getBatchOr404(forced.id).skipped).toBe(0)
  })

  it('rechaza un segundo batch activo y permite cancelar el primero', async () => {
    const entered = deferred()
    const release = deferred()
    const executor: BatchExecutor = {
      hasAsset: async () => false,
      runStep: async (sceneId) => {
        if (sceneId === 'scene-a') {
          entered.resolve()
          await release.promise
        }
      },
    }

    const run = await startBatch('project-3', { steps: ['image'] }, { loadScenes: twoScenes, executor })
    await entered.promise
    await expect(
      startBatch('project-3', { steps: ['image'] }, { loadScenes: twoScenes, executor }),
    ).rejects.toMatchObject({ problem: { code: 'STATE_CONFLICT' } })

    expect(controlBatch(run.id, 'cancel').status).toBe('cancelled')
    release.resolve()
    await sleep(300)
    expect(getBatchOr404(run.id).status).toBe('cancelled')
    expect(getBatchOr404(run.id).finishedAt).not.toBeNull()
    expect(() => controlBatch(run.id, 'resume')).toThrow()
  })
})
