// Integración: recuperación de *_pending huérfanos (regresión P1) sobre SQLite real,
// aplicando la migración baseline con `prisma migrate deploy`.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const dbFile = `__test_${randomUUID()}.db`
const dbPath = join(process.cwd(), 'prisma', dbFile)
const databaseUrl = `file:./${dbFile}`

const prismaBin = join(
  process.cwd(),
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.exe' : 'prisma',
)

let db: import('@prisma/client').PrismaClient
let getScene: typeof import('@/lib/airshot/services/scenes').getScene
let projectId = ''
let sceneId = ''

beforeAll(async () => {
  execFileSync(prismaBin, ['migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  })
  process.env.DATABASE_URL = databaseUrl
  db = (await import('@/lib/db')).db
  getScene = (await import('@/lib/airshot/services/scenes')).getScene

  projectId = randomUUID()
  sceneId = randomUUID()
  await db.project.create({ data: { id: projectId, title: 'p', originalStory: 'story' } })
  await db.scene.create({
    data: {
      id: sceneId,
      projectId,
      orderIndex: 0,
      originalText: 'una escena',
      status: 'image_pending',
    },
  })
})

afterAll(async () => {
  vi.useRealTimers()
  await db?.$disconnect()
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = `${dbPath}${suffix}`
    if (existsSync(p)) rmSync(p)
  }
})

describe('recuperación de escenas *_pending (B1 generalizado)', () => {
  it('un image_pending reciente se devuelve tal cual (no se marca huérfano)', async () => {
    const scene = await getScene(sceneId)
    expect(scene.status).toBe('image_pending')
  })

  it('un image_pending stale (proceso muerto) pasa a failed con snapshot PROVIDER_TIMEOUT', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.now() + 301_000))
    const scene = await getScene(sceneId)
    vi.useRealTimers()

    expect(scene.status).toBe('failed')
    expect(scene.lastError?.code).toBe('PROVIDER_TIMEOUT')
    expect(scene.lastError?.retryable).toBe(true)
    // la persistencia es real, no solo el DTO
    const row = await db.scene.findUniqueOrThrow({ where: { id: sceneId } })
    expect(row.status).toBe('failed')
  })

  it('audio_pending stale también se recupera (antes solo video_pending)', async () => {
    const audioSceneId = randomUUID()
    await db.scene.create({
      data: { id: audioSceneId, projectId, orderIndex: 1, originalText: 'x', status: 'audio_pending' },
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.now() + 301_000))
    const scene = await getScene(audioSceneId)
    vi.useRealTimers()
    expect(scene.status).toBe('failed')
    expect(scene.lastError?.code).toBe('PROVIDER_TIMEOUT')
  })
})
