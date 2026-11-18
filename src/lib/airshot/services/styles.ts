// AirShot — services/styles.ts (estilos visuales; semilla isCustom=false intocable)

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { AppError } from '@/lib/airshot/core/errors'
import { toVisualStyleResponse } from '@/lib/airshot/domain/dto'
import type { VisualStyleResponseDto } from '@/lib/airshot/domain/dto'
import { buildPage, decodeCursor, seekCreatedAt, type Order } from '@/lib/airshot/core/pagination'
import type { Page } from '@/lib/airshot/core/pagination'
import type { VisualStyle } from '@prisma/client'
import type { z } from 'zod'
import type { CreateVisualStyleRequest, PatchVisualStyleRequest } from '@/lib/airshot/domain/schemas'

async function getStyleOr404(id: string): Promise<VisualStyle> {
  const row = await db.visualStyle.findUnique({ where: { id } })
  if (row === null) throw new AppError('NOT_FOUND', `estilo ${id} no encontrado`)
  return row
}

export async function createStyle(body: z.infer<typeof CreateVisualStyleRequest>): Promise<VisualStyleResponseDto> {
  const existing = await db.visualStyle.findUnique({ where: { name: body.name } })
  if (existing !== null) {
    throw new AppError('VALIDATION_ERROR', `el estilo "${body.name}" ya existe (name único)`, { field: 'name' })
  }
  const row = await db.visualStyle.create({
    data: {
      id: randomUUID(),
      name: body.name,
      description: body.description ?? null,
      promptFragmentEn: body.promptFragmentEn,
      isCustom: true,
    },
  })
  return toVisualStyleResponse(row)
}

export async function listStyles(query: {
  limit: number
  cursor: string | null
  order: Order
  origin?: string
}): Promise<Page<VisualStyleResponseDto>> {
  const where: Prisma.VisualStyleWhereInput = {}
  if (query.origin !== undefined) {
    if (query.origin !== 'seeded' && query.origin !== 'custom') {
      throw new AppError('VALIDATION_ERROR', `origin="${query.origin}" fuera de whitelist [seeded|custom]`, { field: 'origin' })
    }
    where.isCustom = query.origin === 'custom'
  }
  if (query.cursor !== null) {
    const dec = decodeCursor(query.cursor)
    Object.assign(where, seekCreatedAt(query.order, String(dec.v), dec.i ?? ''))
  }
  const rows = await db.visualStyle.findMany({
    where,
    orderBy: [{ createdAt: query.order }, { id: query.order }],
    take: query.limit + 1,
  })
  const items = rows.map(toVisualStyleResponse)
  return buildPage(items, query.limit, (row) => ({ v: row.createdAt, i: row.id }))
}

export async function patchStyle(id: string, body: z.infer<typeof PatchVisualStyleRequest>): Promise<VisualStyleResponseDto> {
  await getStyleOr404(id)
  if (body.name !== undefined) {
    const existing = await db.visualStyle.findUnique({ where: { name: body.name } })
    if (existing !== null && existing.id !== id) {
      throw new AppError('VALIDATION_ERROR', `el estilo "${body.name}" ya existe (name único)`, { field: 'name' })
    }
  }
  const data: Record<string, unknown> = {}
  for (const key of ['name', 'description', 'promptFragmentEn'] as const) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      data[key] = (body as Record<string, unknown>)[key]
    }
  }
  const updated = Object.keys(data).length > 0 ? await db.visualStyle.update({ where: { id }, data: data as Prisma.VisualStyleUpdateInput }) : await getStyleOr404(id)
  return toVisualStyleResponse(updated)
}

export async function deleteStyle(id: string): Promise<void> {
  const row = await getStyleOr404(id)
  if (!row.isCustom) {
    throw new AppError('DELETION_FORBIDDEN', 'los estilos sembrados (isCustom=false) son parte del producto y no se borran', {
      hints: ['Puedes editar su promptFragmentEn con PATCH; crea estilos propios con POST /visual-styles.'],
    })
  }
  await db.visualStyle.delete({ where: { id } })
}
