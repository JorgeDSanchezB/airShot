// AirShot — services/projects.ts (use cases de proyectos; ADR-016: repos
// plegados en la capa de servicio — Prisma ya aporta el límite de abstracción
// que el patrón buscaba; decisión problema/coste/alternativa en el ADR)

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { toProjectResponse, toProjectSummary } from '@/lib/airshot/domain/dto'
import { PROJECT_STATUSES, OUTPUT_RESOLUTIONS } from '@/lib/airshot/domain/enums'
import { buildPage, decodeCursor, seekCreatedAt, type Order } from '@/lib/airshot/core/pagination'
import type { Page } from '@/lib/airshot/core/pagination'
import type { ProjectSummaryDto, ProjectResponseDto } from '@/lib/airshot/domain/dto'
import type { z } from 'zod'
import type { CreateProjectRequest, PatchProjectRequest } from '@/lib/airshot/domain/schemas'

export async function createProject(body: z.infer<typeof CreateProjectRequest>): Promise<ProjectResponseDto> {
  const settings = body.settings ?? {}
  if (settings.visualStyleId !== undefined && settings.visualStyleId !== null) {
    const style = await db.visualStyle.findUnique({ where: { id: settings.visualStyleId } })
    if (style === null) {
      throw new AppError('VALIDATION_ERROR', 'settings.visualStyleId no existe', { field: 'settings.visualStyleId' })
    }
  }
  const row = await db.project.create({
    data: {
      id: randomUUID(),
      title: body.title,
      originalStory: body.originalStory,
      visualStyleId: settings.visualStyleId ?? null,
      videoProvider: settings.videoProvider ?? null,
      ttsProvider: settings.ttsProvider ?? airshotConfig.providers.default_tts,
      outputResolution: settings.outputResolution ?? '720p',
      voiceId: settings.voiceId ?? null,
      visualSeed: settings.visualSeed ?? null,
      musicVolume: airshotConfig.assembly.music_default_volume,
      status: 'draft',
    },
  })
  return toProjectResponse(row, 0, await styleNameOf(row.visualStyleId))
}

export async function getProjectOr404(id: string) {
  const row = await db.project.findUnique({ where: { id } })
  if (row === null) throw new AppError('NOT_FOUND', `proyecto ${id} no encontrado`, { projectId: id })
  return row
}

export async function getProject(id: string): Promise<ProjectResponseDto> {
  const row = await getProjectOr404(id)
  const sceneCount = await db.scene.count({ where: { projectId: id } })
  return toProjectResponse(row, sceneCount, await styleNameOf(row.visualStyleId))
}

export async function listProjects(query: {
  limit: number
  cursor: string | null
  order: Order
  status?: string
  q?: string
}): Promise<Page<ProjectSummaryDto>> {
  const where: Prisma.ProjectWhereInput = {}
  if (query.status !== undefined) {
    if (!PROJECT_STATUSES.includes(query.status as (typeof PROJECT_STATUSES)[number])) {
      throw new AppError('VALIDATION_ERROR', `status="${query.status}" fuera de enum`, { field: 'status' })
    }
    where.status = query.status
  }
  if (query.q !== undefined && query.q.length > 0) {
    // §3.1.3: predicado residual por PREFIJO (LIKE q%) — corregido en ronda B (antes contains)
    where.title = { startsWith: query.q }
  }
  if (query.cursor !== null) {
    const dec = decodeCursor(query.cursor)
    Object.assign(where, seekCreatedAt(query.order, String(dec.v), dec.i ?? ''))
  }
  const rows = await db.project.findMany({
    where,
    orderBy: [{ createdAt: query.order }, { id: query.order }],
    take: query.limit + 1,
  })
  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.id, await db.scene.count({ where: { projectId: row.id } }))
  }
  const items = rows.map((row) => toProjectSummary(row, counts.get(row.id) ?? 0))
  return buildPage(items, query.limit, (row) => ({ v: row.createdAt, i: row.id }))
}

export async function patchProject(id: string, body: z.infer<typeof PatchProjectRequest>): Promise<ProjectResponseDto> {
  const row = await getProjectOr404(id)
  if (body.visualStyleId !== undefined && body.visualStyleId !== null) {
    const style = await db.visualStyle.findUnique({ where: { id: body.visualStyleId } })
    if (style === null) {
      throw new AppError('VALIDATION_ERROR', 'visualStyleId no existe', { field: 'visualStyleId' })
    }
  }
  if (body.outputResolution !== undefined && !OUTPUT_RESOLUTIONS.includes(body.outputResolution)) {
    throw new AppError('VALIDATION_ERROR', 'outputResolution inválido', { field: 'outputResolution' })
  }
  // semántica ausente≠nulo: solo las claves presentes se aplican
  const data: Record<string, unknown> = {}
  const keys = ['title', 'originalStory', 'improvedStory', 'visualStyleId', 'videoProvider', 'ttsProvider', 'outputResolution', 'voiceId', 'musicVolume', 'visualSeed'] as const
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      data[key] = (body as Record<string, unknown>)[key]
    }
  }
  const updated = Object.keys(data).length > 0 ? await db.project.update({ where: { id }, data: data as Prisma.ProjectUpdateInput }) : row
  const sceneCount = await db.scene.count({ where: { projectId: id } })
  return toProjectResponse(updated, sceneCount, await styleNameOf(updated.visualStyleId))
}

export async function deleteProject(id: string): Promise<void> {
  const row = await getProjectOr404(id)
  // recolectar assets antes del CASCADE para borrarlos de storage
  const scenes = await db.scene.findMany({ where: { projectId: id } })
  for (const scene of scenes) {
    storage.delete(scene.imageBasePath)
    storage.delete(scene.videoClipPath)
    storage.delete(scene.audioPath)
  }
  const references = await db.reference.findMany({ where: { projectId: id } })
  for (const ref of references) {
    for (const img of JSON.parse(ref.referenceImages || '[]') as Array<{ storageKey: string }>) {
      storage.delete(img.storageKey)
    }
  }
  storage.delete(row.musicAssetKey)
  const jobs = await db.assemblyJob.findMany({ where: { projectId: id } })
  for (const job of jobs) {
    storage.delete(job.outputPath)
  }
  await db.project.delete({ where: { id } })
}

async function styleNameOf(visualStyleId: string | null): Promise<string | null> {
  if (visualStyleId === null) return null
  const style = await db.visualStyle.findUnique({ where: { id: visualStyleId } })
  return style?.name ?? null
}
