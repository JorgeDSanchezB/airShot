// Integración del versionado de assets: registro, undo no destructivo y retención.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const dbFile = `__test_${randomUUID()}.db`
const dbPath = join(process.cwd(), 'prisma', dbFile)
const databaseUrl = `file:./${dbFile}`
const prismaBin = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.exe' : 'prisma')

let db: import('@prisma/client').PrismaClient
let storage: typeof import('@/lib/airshot/infrastructure/storage').storage
let recordAssetVersion: typeof import('@/lib/airshot/services/versions').recordAssetVersion
let listSceneVersions: typeof import('@/lib/airshot/services/versions').listSceneVersions
let restoreSceneVersion: typeof import('@/lib/airshot/services/versions').restoreSceneVersion

const projectId = randomUUID()
const sceneId = randomUUID()
const dir = `uploads/__test_versions__/${projectId}`

beforeAll(async () => {
  execFileSync(prismaBin, ['migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' })
  process.env.DATABASE_URL = databaseUrl
  db = (await import('@/lib/db')).db
  storage = (await import('@/lib/airshot/infrastructure/storage')).storage
  ;({ recordAssetVersion, listSceneVersions, restoreSceneVersion } = await import('@/lib/airshot/services/versions'))
  await db.project.create({ data: { id: projectId, title: 'versions', originalStory: 'x' } })
  await db.scene.create({ data: { id: sceneId, projectId, orderIndex: 0, originalText: 'x', durationSeconds: 4 } })
})

afterAll(async () => {
  const versions = await db?.sceneAssetVersion.findMany({ where: { sceneId } }).catch(() => []) ?? []
  for (const version of versions) if (storage.exists(version.storageKey)) storage.delete(version.storageKey)
  for (const key of ['a.png', 'b.png']) if (storage.exists(`${dir}/${key}`)) storage.delete(`${dir}/${key}`)
  await db?.$disconnect()
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = `${dbPath}${suffix}`
    if (existsSync(p)) rmSync(p)
  }
})

describe('versionado de assets', () => {
  it('restaura una versión anterior conservando la actual en el historial', async () => {
    const oldKey = `${dir}/a.png`
    const newKey = `${dir}/b.png`
    storage.save(oldKey, Buffer.from('old'))
    storage.save(newKey, Buffer.from('new'))
    await db.scene.update({ where: { id: sceneId }, data: { imageBasePath: oldKey, status: 'image_ready' } })
    await recordAssetVersion(sceneId, 'image', oldKey, { provider: 'ai' })
    await db.scene.update({ where: { id: sceneId }, data: { imageBasePath: newKey } })
    await recordAssetVersion(sceneId, 'image', newKey, { provider: 'ai' })

    const before = await listSceneVersions(sceneId)
    expect(before.map((v) => v.storageKey)).toContain(oldKey)
    const oldVersion = before.find((v) => v.storageKey === oldKey)
    expect(oldVersion).toBeDefined()

    await restoreSceneVersion(sceneId, oldVersion!.id)
    const scene = await db.scene.findUniqueOrThrow({ where: { id: sceneId } })
    expect(scene.imageBasePath).toBe(oldKey)
    expect(scene.status).toBe('image_ready')
    // el asset que estaba activo sigue disponible para rehacer
    const after = await listSceneVersions(sceneId)
    expect(after.map((v) => v.storageKey)).toContain(newKey)
    expect(after.length).toBeGreaterThanOrEqual(2)
  })

  it('aplica la retención max por tipo', async () => {
    const keys: string[] = []
    for (let i = 0; i < 12; i++) {
      const distinct = `${dir}/bulk-${i}.png`
      storage.save(distinct, Buffer.from(String(i)))
      keys.push(distinct)
      await recordAssetVersion(sceneId, 'audio', distinct, {})
    }
    const audioVersions = (await listSceneVersions(sceneId)).filter((v) => v.kind === 'audio')
    expect(audioVersions.length).toBeLessThanOrEqual(10)
    // los ficheros de las versiones descartadas se limpian
    const remaining = new Set(audioVersions.map((v) => v.storageKey))
    const prunedFiles = keys.filter((k) => !remaining.has(k))
    expect(prunedFiles.length).toBeGreaterThan(0)
    expect(prunedFiles.every((k) => !storage.exists(k))).toBe(true)
  })
})
