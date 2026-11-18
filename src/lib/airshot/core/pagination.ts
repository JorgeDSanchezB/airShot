// AirShot — core/pagination.ts
// Paginación por cursor (LISTÓN «Lista Infinita»; F3 §3.1.3):
// - cursor opaco base64url de la clave compuesta (createdAt,id) o (orderIndex)
// - limit ∈ [1, pagination.max_page_size]; fuera de rango → 422 (nunca recorte silencioso)
// - sortBy/order whitelists por endpoint; cursor malformado → 422
// - sin `total` (COUNT(*) es O(n) — alternativa descartada y documentada)

import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'

export type Order = 'asc' | 'desc'

export type ListQuery = {
  limit: number
  cursor: string | null
  sortBy: string
  order: Order
}

export type Page<T> = {
  items: T[]
  nextCursor: string | null
  limit: number
}

export function parseListQuery(
  searchParams: URLSearchParams,
  opts: { sortWhitelist: string[]; defaultSort: string; defaultOrder?: Order },
): ListQuery {
  const { pagination } = airshotConfig

  let limit = pagination.default_page_size
  const rawLimit = searchParams.get('limit')
  if (rawLimit !== null) {
    const n = Number(rawLimit)
    if (!Number.isInteger(n) || n < 1) {
      throw new AppError('VALIDATION_ERROR', `limit inválido: "${rawLimit}" (entero ≥ 1)`, {
        field: 'limit',
        hints: [`Máximo admitido: pagination.max_page_size = ${pagination.max_page_size}`],
      })
    }
    if (n > pagination.max_page_size) {
      throw new AppError('VALIDATION_ERROR', `limit=${n} supera pagination.max_page_size=${pagination.max_page_size}`, {
        field: 'limit',
        hints: [`Reduce limit a ≤ ${pagination.max_page_size}; no se recorta en silencio.`],
      })
    }
    limit = n
  }

  const sortBy = searchParams.get('sortBy') ?? opts.defaultSort
  if (!opts.sortWhitelist.includes(sortBy)) {
    throw new AppError('VALIDATION_ERROR', `sortBy="${sortBy}" fuera de whitelist [${opts.sortWhitelist.join('|')}]`, {
      field: 'sortBy',
      hints: ['Sorts arbitrarios rompen la estabilidad del cursor (extensión v2 con clave compuesta).'],
    })
  }

  const orderRaw = searchParams.get('order')
  const order: Order = orderRaw === null ? (opts.defaultOrder ?? 'desc') : orderRaw as Order
  if (order !== 'asc' && order !== 'desc') {
    throw new AppError('VALIDATION_ERROR', `order="${orderRaw}" inválido (asc|desc)`, { field: 'order' })
  }

  const cursorRaw = searchParams.get('cursor')
  let cursor: string | null = null
  if (cursorRaw !== null && cursorRaw !== '') {
    // cursor malformado ⇒ 422 (dato inválido, nunca se ignora en silencio)
    try {
      const decoded = Buffer.from(cursorRaw, 'base64url').toString('utf8')
      const parsed = JSON.parse(decoded) as { v?: number | string; i?: string }
      if (parsed === null || typeof parsed !== 'object' || parsed.v === undefined) {
        throw new Error('bad shape')
      }
      // m1 (ronda de corrección): consistencia de forma con el tipo de orden —
      // las colecciones createdAt esperan ISO datetime; order espera orderIndex numérico
      if (typeof parsed.v === 'string' && Number.isNaN(Date.parse(parsed.v))) {
        throw new Error('bad createdAt value')
      }
      cursor = cursorRaw
    } catch {
      throw new AppError('VALIDATION_ERROR', 'cursor malformado, ilegible o inconsistente con el sortBy de la request', { field: 'cursor' })
    }
  }

  return { limit, cursor, sortBy, order }
}

/** Variante para colecciones con cursor opaco propio (p. ej. voces: base64url(id)). */
export function parseBasicPageQuery(searchParams: URLSearchParams): { limit: number; cursor: string | null } {
  const { pagination } = airshotConfig
  let limit = pagination.default_page_size
  const rawLimit = searchParams.get('limit')
  if (rawLimit !== null) {
    const n = Number(rawLimit)
    if (!Number.isInteger(n) || n < 1) {
      throw new AppError('VALIDATION_ERROR', `limit inválido: "${rawLimit}" (entero ≥ 1)`, { field: 'limit' })
    }
    if (n > pagination.max_page_size) {
      throw new AppError('VALIDATION_ERROR', `limit=${n} supera pagination.max_page_size=${pagination.max_page_size}`, { field: 'limit' })
    }
    limit = n
  }
  const cursorRaw = searchParams.get('cursor')
  return { limit, cursor: cursorRaw !== null && cursorRaw !== '' ? cursorRaw : null }
}

export function decodeCursor(cursor: string): { v: number | string; i?: string } {
  return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { v: number | string; i?: string }
}

export function encodeCursorValue(v: number | string, i?: string): string {
  return Buffer.from(JSON.stringify({ v, i }), 'utf8').toString('base64url')
}

export function buildPage<T extends { id: string }>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => { v: number | string; i?: string },
): Page<T> {
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items[items.length - 1]
  const nextCursor = last !== undefined && hasMore ? encodeCursorValue(cursorOf(last).v, cursorOf(last).i ?? last.id) : null
  return { items, nextCursor, limit }
}

/** Predicado seek compuesto (createdAt,id) — portable, sin OFFSET. */
export function seekCreatedAt(order: Order, v: string, i: string) {
  if (order === 'desc') {
    return {
      OR: [
        { createdAt: { lt: new Date(v) } },
        { AND: [{ createdAt: { equals: new Date(v) } }, { id: { lt: i } }] },
      ],
    }
  }
  return {
    OR: [
      { createdAt: { gt: new Date(v) } },
      { AND: [{ createdAt: { equals: new Date(v) } }, { id: { gt: i } }] },
    ],
  }
}

/** Predicado seek simple por orderIndex (único dentro del proyecto — INV-02). */
export function seekOrderIndex(order: Order, v: number) {
  return order === 'desc' ? { orderIndex: { lt: v } } : { orderIndex: { gt: v } }
}
