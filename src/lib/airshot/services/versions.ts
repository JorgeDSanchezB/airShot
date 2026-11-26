// AirShot — services/versions.ts
// Historial de assets por escena (imagen/clip/narración): cada regeneración
// conserva el asset anterior y registra el nuevo; restaurar es no destructivo
// (el actual se versiona antes de volver atrás). Retención en scene.asset_versions_max.

import { randomUUID } from 'node:crypto'
import type { Scene } from '@prisma/client'
import { db } from '@/lib/db'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { storage } from '@/lib/airshot/infrastructure/storage'

export type AssetKind = 'image' | 'video' | 'audio'

export type VersionOptions = {
  provider?: string | null
  prompt?: string | null
  meta?: Record<string, unknown>
}

function fieldValue(scene: Scene, kind: AssetKind): string | null {
  if (kind === 'image') return scene.imageBasePath
  if (kind === 'video') return scene.videoClipPath
  return scene.audioPath
}

async function prune(sceneId: string, kind: AssetKind): Promise<void> {
  const max = airshotConfig.scene.asset_versions_max
  const rows = await db.sceneAssetVersion.findMany({
    where: { sceneId, kind },
    orderBy: { createdAt: 'desc' },
  })
  if (rows.length <= max) return
  const scene = await db.scene.findUnique({ where: { id: sceneId } })
  const currentKey = scene === null ? null : fieldValue(scene, kind)
  const kept = rows.slice(0, max)
  const keptKeys = new Set(kept.map((row) => row.storageKey))
  if (currentKey !== null) keptKeys.add(currentKey)
  for (const row of rows.slice(max)) {
    await db.sceneAssetVersion.delete({ where: { id: row.id } })
    if (!keptKeys.has(row.storageKey) && !kept.some((k) => k.storageKey === row.storageKey)) {
      storage.delete(row.storageKey)
    }
  }
}

/** Registra un asset en el historial (idempotente por escena+tipo+key) y aplica retención. */
export async function recordAssetVersion(sceneId: string, kind: AssetKind, storageKey: string, opts: VersionOptions = {}): Promise<void> {
  const existing = await db.sceneAssetVersion.findFirst({ where: { sceneId, kind, storageKey } })
  if (existing === null) {
    await db.sceneAssetVersion.create({
      data: {
        id: randomUUID(),
        sceneId,
        kind,
        storageKey,
        provider: opts.provider ?? null,
        prompt: opts.prompt ?? null,
        meta: JSON.stringify(opts.meta ?? {}),
      },
    })
  }
  await prune(sceneId, kind)
}

export async function listSceneVersions(sceneId: string): Promise<Array<{ id: string; sceneId: string; kind: AssetKind; storageKey: string; provider: string | null; prompt: string | null; meta: Record<string, unknown>; createdAt: Date }>> {
  const rows = await db.sceneAssetVersion.findMany({ where: { sceneId }, orderBy: { createdAt: 'desc' } })
  return rows.map((row) => ({
    id: row.id,
    sceneId: row.sceneId,
    kind: row.kind as AssetKind,
    storageKey: row.storageKey,
    provider: row.provider,
    prompt: row.prompt,
    meta: JSON.parse(row.meta || '{}') as Record<string, unknown>,
    createdAt: row.createdAt,
  }))
}

/** Vuelve a una versión: el asset actual se conserva en el historial antes del cambio. */
export async function restoreSceneVersion(sceneId: string, versionId: string): Promise<void> {
  const version = await db.sceneAssetVersion.findUnique({ where: { id: versionId } })
  if (version === null || version.sceneId !== sceneId) {
    throw new AppError('NOT_FOUND', `versión ${versionId} no encontrada para la escena`, { sceneId, hints: [`versionId=${versionId}`] })
  }
  if (!storage.exists(version.storageKey)) {
    throw new AppError('NOT_FOUND', 'el archivo de esa versión ya no existe en disco', { sceneId, hints: [`versionId=${versionId}`] })
  }
  const scene = await db.scene.findUnique({ where: { id: sceneId } })
  if (scene === null) throw new AppError('NOT_FOUND', `escena ${sceneId} no encontrada`, { sceneId })
  const kind = version.kind as AssetKind
  const currentKey = fieldValue(scene, kind)
  if (currentKey !== null && currentKey !== version.storageKey) {
    await recordAssetVersion(sceneId, kind, currentKey, {})
  }
  const meta = JSON.parse(version.meta || '{}') as { effectiveSeconds?: unknown; durationSeconds?: unknown; format?: unknown }
  const data: Record<string, unknown> = { status: `${kind}_ready`, lastError: null }
  if (kind === 'image') data.imageBasePath = version.storageKey
  if (kind === 'video') {
    data.videoClipPath = version.storageKey
    data.videoEffectiveSeconds = typeof meta.effectiveSeconds === 'number' ? meta.effectiveSeconds : null
    data.trimStartSeconds = null
    data.trimEndSeconds = null
  }
  if (kind === 'audio') {
    data.audioPath = version.storageKey
    data.audioDurationSeconds = typeof meta.durationSeconds === 'number' ? meta.durationSeconds : null
  }
  await db.scene.update({ where: { id: sceneId }, data: data as Parameters<typeof db.scene.update>[0]['data'] })
}
