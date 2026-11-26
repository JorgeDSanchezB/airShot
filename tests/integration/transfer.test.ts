// Integración de transferencia: export .airshot → import con ids/claves nuevos,
// respaldo VACUUM INTO y barrido/limpieza de media huérfana sin tocar versiones.
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
let transfer: typeof import('@/lib/airshot/services/transfer')
let maintenance: typeof import('@/lib/airshot/services/maintenance')

const projectId = randomUUID()
const sceneId = randomUUID()
const referenceId = randomUUID()
const versionKey = `outputs/__test_transfer__/${projectId}/old_image.png`
const orphanKey = `uploads/__test_transfer__/${projectId}/orphan.bin`
const exportedKeys: string[] = []
let musicKey = ''

beforeAll(async () => {
  execFileSync(prismaBin, ['migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' })
  process.env.DATABASE_URL = databaseUrl
  db = (await import('@/lib/db')).db
  storage = (await import('@/lib/airshot/infrastructure/storage')).storage
  transfer = await import('@/lib/airshot/services/transfer')
  maintenance = await import('@/lib/airshot/services/maintenance')

  const existImage = `outputs/__test_transfer__/${projectId}/scene.png`
  const existAudio = `outputs/__test_transfer__/${projectId}/scene.mp3`
  musicKey = storage.musicAsset(projectId, 'mp3')
  storage.save(existImage, Buffer.from('img-bytes'))
  storage.save(existAudio, Buffer.from('aud-bytes'))
  storage.save(musicKey, Buffer.from('mus-bytes'))
  storage.save(versionKey, Buffer.from('version-bytes'))

  await db.project.create({
    data: {
      id: projectId,
      title: 'Transfer test',
      originalStory: 'historia',
      musicAssetKey: musicKey,
      musicOriginalName: 'tema.mp3',
      musicDurationSeconds: 12.5,
      visualSeed: 42,
    },
  })
  await db.reference.create({
    data: {
      id: referenceId,
      projectId,
      type: 'character',
      name: 'Mara',
      attributes: JSON.stringify({ hair: 'negra' }),
      referenceImages: JSON.stringify([{ id: randomUUID(), storageKey: existImage, isPrimary: true, source: 'ai', createdAt: new Date().toISOString() }]),
      libraryScope: 'project',
      level: 'advanced',
    },
  })
  await db.scene.create({
    data: {
      id: sceneId,
      projectId,
      orderIndex: 0,
      originalText: 'escena original',
      improvedText: 'escena mejorada',
      promptEn: 'a woman in the rain',
      durationSeconds: 6,
      seed: 7,
      imageBasePath: existImage,
      audioPath: existAudio,
      status: 'image_ready',
    },
  })
  await db.sceneReference.create({ data: { id: randomUUID(), sceneId, referenceId, kind: 'subject' } })
  await db.sceneAssetVersion.create({ data: { id: randomUUID(), sceneId, kind: 'image', storageKey: versionKey } })
})

afterAll(async () => {
  const projects = await db?.project.findMany({ where: { title: 'Transfer test' } }).catch(() => []) ?? []
  for (const project of projects) {
    const scenes = await db.scene.findMany({ where: { projectId: project.id } }).catch(() => []) ?? []
    for (const scene of scenes) {
      for (const key of [scene.imageBasePath, scene.videoClipPath, scene.audioPath]) if (key !== null) storage.delete(key)
    }
    const references = await db.reference.findMany({ where: { projectId: project.id } }).catch(() => []) ?? []
    for (const reference of references) {
      const images = JSON.parse(reference.referenceImages) as Array<{ storageKey: string }>
      for (const image of images) storage.delete(image.storageKey)
    }
    if (project.musicAssetKey !== null) storage.delete(project.musicAssetKey)
  }
  await db?.$disconnect()
  for (const key of [versionKey, orphanKey, musicKey, ...exportedKeys]) if (storage.exists(key)) storage.delete(key)
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = `${dbPath}${suffix}`
    if (existsSync(p)) rmSync(p)
  }
})

describe('export/import .airshot', () => {
  it('exporta con media y reimporta con ids y claves nuevos', async () => {
    const exported = await transfer.exportProject(projectId, { includeMedia: true })
    exportedKeys.push(exported.key)
    expect(exported.mediaFiles).toBeGreaterThanOrEqual(3)
    expect(storage.exists(exported.key)).toBe(true)
    const archive = storage.open(exported.key)

    const imported = await transfer.importProject(archive)
    expect(imported.projectId).not.toBe(projectId)
    expect(imported.scenes).toBe(1)
    expect(imported.references).toBe(1)
    expect(imported.warnings).toEqual([])

    const scene = await db.scene.findFirstOrThrow({ where: { projectId: imported.projectId } })
    expect(scene.imageBasePath).not.toBe(`outputs/__test_transfer__/${projectId}/scene.png`)
    expect(scene.imageBasePath?.startsWith(`uploads/projects/${imported.projectId}/scenes/${scene.id}/`)).toBe(true)
    expect(scene.seed).toBe(7)
    expect(scene.status).toBe('image_ready')
    expect(storage.exists(scene.imageBasePath)).toBe(true)
    expect(storage.exists(scene.audioPath)).toBe(true)

    const project = await db.project.findUniqueOrThrow({ where: { id: imported.projectId } })
    expect(project.visualSeed).toBe(42)
    expect(project.musicVolume).toBe(0.25)
    expect(project.musicOriginalName).toBe('tema.mp3')
    expect(project.musicDurationSeconds).toBe(12.5)
    expect(storage.exists(project.musicAssetKey)).toBe(true)

    const reference = await db.reference.findFirstOrThrow({ where: { projectId: imported.projectId } })
    expect(reference.name).toBe('Mara')
    const images = JSON.parse(reference.referenceImages) as Array<{ storageKey: string; isPrimary: boolean; source: string }>
    expect(images).toHaveLength(1)
    expect(images[0].isPrimary).toBe(true)
    expect(images[0].source).toBe('ai')
    expect(storage.exists(images[0].storageKey)).toBe(true)
    const edge = await db.sceneReference.findFirstOrThrow({ where: { sceneId: scene.id } })
    expect(edge.referenceId).toBe(reference.id)
    expect(edge.kind).toBe('subject')
  })

  it('sin media solo viaja la estructura', async () => {
    const exported = await transfer.exportProject(projectId, { includeMedia: false })
    exportedKeys.push(exported.key)
    expect(exported.mediaFiles).toBe(0)
    const imported = await transfer.importProject(storage.open(exported.key))
    const scene = await db.scene.findFirstOrThrow({ where: { projectId: imported.projectId } })
    expect(scene.imageBasePath).toBeNull()
    expect(scene.audioPath).toBeNull()
    expect(scene.promptEn).toBe('a woman in the rain')
    const project = await db.project.findUniqueOrThrow({ where: { id: imported.projectId } })
    expect(project.musicAssetKey).toBeNull()
  })

  it('rechaza archivos que no son .airshot', async () => {
    await expect(transfer.importProject(Buffer.from('no soy un zip'))).rejects.toMatchObject({ problem: { code: 'VALIDATION_ERROR' } })
  })
})

describe('salud de datos', () => {
  it('respalda la BD con VACUUM INTO', async () => {
    const backup = await maintenance.backupDatabase()
    expect(backup.sizeBytes).toBeGreaterThan(0)
    expect(storage.exists(backup.key)).toBe(true)
    storage.delete(backup.key)
  })

  it('detecta y borra huérfanos sin tocar versiones ni packages', async () => {
    storage.save(orphanKey, Buffer.from('basura'))
    const report = await maintenance.scanOrphans()
    expect(report.orphans.some((orphan) => orphan.key === orphanKey)).toBe(true)
    expect(report.orphans.some((orphan) => orphan.key === versionKey)).toBe(false)
    expect(report.orphans.some((orphan) => orphan.key.startsWith('packages/'))).toBe(false)

    const gc = await maintenance.gcOrphans(true)
    expect(gc.deletedFiles).toBeGreaterThanOrEqual(1)
    expect(storage.exists(orphanKey)).toBe(false)
    expect(storage.exists(versionKey)).toBe(true)
  })
})
