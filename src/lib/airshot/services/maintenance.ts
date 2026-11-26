// AirShot — services/maintenance.ts
// Salud de datos local: respaldo SQLite (VACUUM INTO, consistente con WAL) y
// detección/limpieza de media huérfana. La GC compara TODAS las claves que la BD
// referencia (escenas, versiones antiguas, referencias, música, jobs) contra los
// archivos bajo data.root; packages/ y backups/ quedan fuera del barrido porque
// son entregables, no huérfanos.

import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { db } from '@/lib/db'
import { AppError } from '@/lib/airshot/core/errors'
import { logger } from '@/lib/airshot/core/logger'
import { toReferenceImages } from '@/lib/airshot/domain/dto'
import { storage } from '@/lib/airshot/infrastructure/storage'

export type DatabaseBackupResult = {
  key: string
  url: string
  sizeBytes: number
  createdAt: string
}

export type OrphanFile = { key: string; sizeBytes: number }

export type MediaReport = {
  scannedAt: string
  totalFiles: number
  totalBytes: number
  referencedKeys: number
  orphanFiles: number
  orphanBytes: number
  orphans: OrphanFile[]
}

export type MediaGcResult = MediaReport & {
  applied: boolean
  deletedFiles: number
  freedBytes: number
}

export async function backupDatabase(): Promise<DatabaseBackupResult> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const key = storage.databaseBackup(stamp)
  const abs = storage.abs(key)
  mkdirSync(dirname(abs), { recursive: true })
  // VACUUM INTO produce un archivo consistente aunque haya WAL; aborta si existe.
  await db.$executeRawUnsafe(`VACUUM INTO '${abs.replace(/'/g, "''")}'`)
  const { size } = statSync(abs)
  logger.info('ops.db_backup', { key, bytes: size })
  return { key, url: storage.resolveUrl(key) ?? '', sizeBytes: size, createdAt: new Date().toISOString() }
}

export async function collectReferencedKeys(): Promise<Set<string>> {
  const [projects, scenes, versions, references, jobs, translations] = await Promise.all([
    db.project.findMany({ select: { musicAssetKey: true } }),
    db.scene.findMany({ select: { imageBasePath: true, videoClipPath: true, audioPath: true } }),
    db.sceneAssetVersion.findMany({ select: { storageKey: true } }),
    db.reference.findMany({ select: { referenceImages: true } }),
    db.assemblyJob.findMany({ select: { outputPath: true, subtitlesPath: true, thumbnailPath: true, subtitlesTracks: true } }),
    db.sceneTranslation.findMany({ select: { audioPath: true } }),
  ])
  const keys = new Set<string>()
  const add = (key: string | null) => {
    if (key !== null && key.length > 0) keys.add(key)
  }
  for (const project of projects) add(project.musicAssetKey)
  for (const scene of scenes) {
    add(scene.imageBasePath)
    add(scene.videoClipPath)
    add(scene.audioPath)
  }
  for (const version of versions) add(version.storageKey)
  for (const reference of references) {
    for (const image of toReferenceImages(reference.referenceImages)) add(image.storageKey)
  }
  for (const job of jobs) {
    add(job.outputPath)
    add(job.subtitlesPath)
    add(job.thumbnailPath)
    try {
      for (const track of JSON.parse(job.subtitlesTracks ?? '[]') as Array<{ path?: string }>) add(track.path ?? null)
    } catch {
      // pista de subtítulos corrupta: no se referencia nada desde este job
    }
  }
  for (const translation of translations) add(translation.audioPath)
  return keys
}

const EXCLUDED_ROOT_DIRS = new Set(['packages', 'backups'])

function walk(dir: string, prefix: string, out: OrphanFile[]): void {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const key = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (prefix.length === 0 && EXCLUDED_ROOT_DIRS.has(entry.name)) continue
      walk(full, key, out)
    } else if (entry.isFile()) {
      try {
        out.push({ key, sizeBytes: statSync(full).size })
      } catch {
        // archivo desaparecido durante el barrido: no es un huérfano a borrar
      }
    }
  }
}

export async function scanOrphans(): Promise<MediaReport> {
  const referenced = await collectReferencedKeys()
  const files: OrphanFile[] = []
  walk(storage.root, '', files)
  const orphans = files.filter((file) => !referenced.has(file.key))
  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0)
  logger.info('ops.media_scan', { files: files.length, referenced: referenced.size, orphans: orphans.length })
  return {
    scannedAt: new Date().toISOString(),
    totalFiles: files.length,
    totalBytes,
    referencedKeys: referenced.size,
    orphanFiles: orphans.length,
    orphanBytes: orphans.reduce((sum, file) => sum + file.sizeBytes, 0),
    orphans,
  }
}

export async function gcOrphans(apply: boolean): Promise<MediaGcResult> {
  if (apply) {
    // un job en curso escribe archivos antes de referenciarlos en la BD: borrar
    // "huérfanos" mientras corre dejaría el ensamblaje roto a mitad de camino
    const running = await db.assemblyJob.count({ where: { status: { in: ['pending', 'running'] } } })
    const pendingScenes = await db.scene.count({ where: { status: { in: ['image_pending', 'video_pending', 'audio_pending'] } } })
    if (running > 0 || pendingScenes > 0) {
      throw new AppError('STATE_CONFLICT', `GC bloqueada: ${running} job(s) en curso y ${pendingScenes} escena(s) *_pending`)
    }
  }
  const report = await scanOrphans()
  let deletedFiles = 0
  let freedBytes = 0
  if (apply) {
    for (const orphan of report.orphans) {
      if (!storage.exists(orphan.key)) continue
      storage.delete(orphan.key)
      deletedFiles++
      freedBytes += orphan.sizeBytes
    }
    logger.warn('ops.media_gc', { deletedFiles, freedBytes })
  }
  return { ...report, applied: apply, deletedFiles, freedBytes }
}
