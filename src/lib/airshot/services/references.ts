// AirShot — services/references.ts (CRUD de referencias + imágenes de referencia)
// INV-04: projectId null ⇔ libraryScope=global (CHECK estructural aplicado en
// esta capa — Prisma/SQLite no soporta CHECK; desviación documentada en ADR-016).
// Imágenes: ids únicos, exactly-one isPrimary si el array no está vacío,
// ≤ reference.max_images_per_reference (422 REFERENCE_IMAGE_LIMIT).

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { validateAttributes, ATTRIBUTES_SCHEMA_VERSION, type JsonValue } from '@/lib/airshot/domain/reference-validator'
import { composeScenePrompt } from '@/lib/airshot/domain/prompt-composer'
import { toReferenceImages, toReferenceResponse } from '@/lib/airshot/domain/dto'
import type { ReferenceResponseDto } from '@/lib/airshot/domain/dto'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { getImageProvider, withProviderConcurrency } from '@/lib/airshot/infrastructure/providers/factory'
import { buildPage, decodeCursor, seekCreatedAt, type Order } from '@/lib/airshot/core/pagination'
import type { Page } from '@/lib/airshot/core/pagination'
import type { Reference } from '@prisma/client'
import type { z } from 'zod'
import type { CreateReferenceRequest, PatchReferenceRequest } from '@/lib/airshot/domain/schemas'

async function getReferenceOr404(id: string): Promise<Reference> {
  const row = await db.reference.findUnique({ where: { id } })
  if (row === null) throw new AppError('NOT_FOUND', `referencia ${id} no encontrada`)
  return row
}

function assertScopeConsistency(libraryScope: string, projectId: string | null | undefined): void {
  if (libraryScope === 'project') {
    if (projectId === null || projectId === undefined) {
      throw new AppError('VALIDATION_ERROR', 'libraryScope=project exige projectId', { field: 'projectId' })
    }
  } else if (projectId !== null && projectId !== undefined) {
    throw new AppError('VALIDATION_ERROR', 'libraryScope=global exige projectId ausente o null (ámbito inconsistente)', { field: 'projectId' })
  }
}

export async function createReference(body: z.infer<typeof CreateReferenceRequest>): Promise<ReferenceResponseDto> {
  const projectId = body.projectId ?? null
  assertScopeConsistency(body.libraryScope, projectId)
  if (projectId !== null) {
    const project = await db.project.findUnique({ where: { id: projectId } })
    if (project === null) throw new AppError('VALIDATION_ERROR', `projectId ${projectId} no existe`, { field: 'projectId' })
  }
  const attributes = validateAttributes((body.attributes ?? {}) as JsonValue)
  const row = await db.reference.create({
    data: {
      id: randomUUID(),
      projectId,
      type: body.type,
      name: body.name,
      description: body.description ?? null,
      attributes: JSON.stringify(attributes),
      referenceImages: '[]',
      libraryScope: body.libraryScope,
      level: body.level ?? 'basic',
      attributesSchemaVersion: ATTRIBUTES_SCHEMA_VERSION,
    },
  })
  return toReferenceResponse(row)
}

export async function getReference(id: string): Promise<ReferenceResponseDto> {
  return toReferenceResponse(await getReferenceOr404(id))
}

export async function listReferences(query: {
  limit: number
  cursor: string | null
  order: Order
  scope?: 'global' | 'project'
  projectId?: string
  type?: string
  level?: string
  q?: string
}): Promise<Page<ReferenceResponseDto>> {
  if (query.scope === 'project' && query.projectId === undefined) {
    throw new AppError('VALIDATION_ERROR', 'scope=project exige projectId en la query', { field: 'projectId' })
  }
  const where: Prisma.ReferenceWhereInput = {}
  if (query.scope === 'global') where.projectId = null
  if (query.scope === 'project' && query.projectId !== undefined) where.projectId = query.projectId
  if (query.type !== undefined) {
    if (!['character', 'location'].includes(query.type)) throw new AppError('VALIDATION_ERROR', `type="${query.type}" fuera de enum`, { field: 'type' })
    where.type = query.type
  }
  if (query.level !== undefined) {
    if (!['basic', 'advanced', 'cinematic'].includes(query.level)) throw new AppError('VALIDATION_ERROR', `level="${query.level}" fuera de enum`, { field: 'level' })
    where.level = query.level
  }
  if (query.q !== undefined && query.q.length > 0) {
    // §3.1.3: predicado residual por PREFIJO (LIKE q%) — corregido en ronda B (antes contains)
    where.name = { startsWith: query.q }
  }
  if (query.cursor !== null) {
    const dec = decodeCursor(query.cursor)
    Object.assign(where, seekCreatedAt(query.order, String(dec.v), dec.i ?? ''))
  }
  const rows = await db.reference.findMany({
    where,
    orderBy: [{ createdAt: query.order }, { id: query.order }],
    take: query.limit + 1,
  })
  const items = rows.map(toReferenceResponse)
  return buildPage(items, query.limit, (row) => ({ v: row.createdAt, i: row.id }))
}

export async function patchReference(id: string, body: z.infer<typeof PatchReferenceRequest>): Promise<ReferenceResponseDto> {
  const row = await getReferenceOr404(id)
  // libraryScope/projectId no son editables vía PATCH (contrato §3.2: type/name/description/level/attributes)
  const data: Record<string, unknown> = {}
  for (const key of ['type', 'name', 'description', 'level'] as const) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      data[key] = (body as Record<string, unknown>)[key]
    }
  }
  if (body.attributes !== undefined) {
    // sustitución COMPLETA del objeto si la clave viene (§4.6)
    data.attributes = JSON.stringify(validateAttributes(body.attributes as JsonValue))
    data.attributesSchemaVersion = ATTRIBUTES_SCHEMA_VERSION
  }
  const updated = Object.keys(data).length > 0 ? await db.reference.update({ where: { id }, data: data as Prisma.ReferenceUpdateInput }) : row
  return toReferenceResponse(updated)
}

export async function deleteReference(id: string): Promise<void> {
  const row = await getReferenceOr404(id)
  for (const img of toReferenceImages(row.referenceImages)) {
    storage.delete(img.storageKey)
  }
  await db.reference.delete({ where: { id } })
}

// ---------------------------------------------------------------- imágenes de referencia

async function appendReferenceImage(id: string, source: 'upload' | 'ai', ext: string, bytes: Buffer): Promise<ReferenceResponseDto> {
  const row = await getReferenceOr404(id)
  const images = toReferenceImages(row.referenceImages)
  if (images.length >= airshotConfig.reference.max_images_per_reference) {
    throw new AppError('REFERENCE_IMAGE_LIMIT', `la referencia ya tiene ${images.length} imágenes ≥ reference.max_images_per_reference=${airshotConfig.reference.max_images_per_reference}`)
  }
  const entry = {
    id: randomUUID(),
    storageKey: storage.referenceImage(id, source, ext),
    isPrimary: images.length === 0,
    source,
    createdAt: new Date().toISOString(),
  }
  storage.save(entry.storageKey, bytes)
  const next = [...images, entry]
  await db.reference.update({ where: { id }, data: { referenceImages: JSON.stringify(next) } })
  return toReferenceResponse({ ...row, referenceImages: JSON.stringify(next) })
}

export async function uploadReferenceImage(id: string, file: { buffer: Buffer; ext: string }): Promise<ReferenceResponseDto> {
  return appendReferenceImage(id, 'upload', file.ext, file.buffer)
}

export async function generateReferenceImage(id: string, styleId?: string): Promise<ReferenceResponseDto> {
  const row = await getReferenceOr404(id)
  let styleFragment: string | null = null
  if (styleId !== undefined) {
    const style = await db.visualStyle.findUnique({ where: { id: styleId } })
    if (style === null) throw new AppError('VALIDATION_ERROR', `styleId ${styleId} no existe`, { field: 'styleId' })
    styleFragment = style.promptFragmentEn
  }
  const attributes = JSON.parse(row.attributes || '{}') as Record<string, unknown>
  const prompt = composeScenePrompt({
    promptEn: `${row.type === 'character' ? 'Character portrait' : 'Location establishing shot'}: ${row.name}${row.description !== null ? `. ${row.description}` : ''}`,
    styleFragmentEn: styleFragment,
    references: [{
      name: row.name,
      description: row.description,
      attributes,
      level: row.level as 'basic' | 'advanced' | 'cinematic',
      kind: row.type === 'character' ? 'subject' : 'environment',
      hasImages: toReferenceImages(row.referenceImages).length > 0,
    }],
  })
  const { provider, name } = await getImageProvider()
  const result = await withProviderConcurrency(name, () => provider.generate({ promptEn: prompt, aspectRatio: '16:9' }))
  return appendReferenceImage(id, 'ai', result.format, result.imageBytes)
}

export async function deleteReferenceImage(id: string, imageId: string): Promise<void> {
  const row = await getReferenceOr404(id)
  const images = toReferenceImages(row.referenceImages)
  const idx = images.findIndex((img) => img.id === imageId)
  if (idx < 0) throw new AppError('NOT_FOUND', `imagen ${imageId} no encontrada en la referencia ${id}`)
  const [removed] = images.splice(idx, 1)
  storage.delete(removed.storageKey)
  // invariante exactly-one: si se borra la primaria y quedan otras, se promueve la primera
  if (removed.isPrimary && images.length > 0) {
    images[0] = { ...images[0], isPrimary: true }
  }
  await db.reference.update({ where: { id }, data: { referenceImages: JSON.stringify(images) } })
}

export async function setPrimaryReferenceImage(id: string, imageId: string, isPrimary: true): Promise<ReferenceResponseDto> {
  const row = await getReferenceOr404(id)
  const images = toReferenceImages(row.referenceImages)
  const target = images.find((img) => img.id === imageId)
  if (target === undefined) throw new AppError('NOT_FOUND', `imagen ${imageId} no encontrada en la referencia ${id}`)
  const next = images.map((img) => ({ ...img, isPrimary: img.id === imageId && isPrimary }))
  await db.reference.update({ where: { id }, data: { referenceImages: JSON.stringify(next) } })
  return toReferenceResponse({ ...row, referenceImages: JSON.stringify(next) })
}
