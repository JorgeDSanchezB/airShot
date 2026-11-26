import { describe, expect, it } from 'vitest'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import {
  buildPage,
  decodeCursor,
  encodeCursorValue,
  parseBasicPageQuery,
  parseListQuery,
  seekCreatedAt,
  seekOrderIndex,
} from '@/lib/airshot/core/pagination'

const opciones = { sortWhitelist: ['createdAt', 'title'], defaultSort: 'createdAt' }
const q = (s: string) => new URLSearchParams(s)

function expectAppError(fn: () => unknown, code: string): void {
  try {
    fn()
  } catch (err) {
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).problem.code).toBe(code)
    return
  }
  throw new Error('se esperaba AppError')
}

describe('parseListQuery (paginación por cursor)', () => {
  it('aplica default_page_size y sort por defecto', () => {
    const parsed = parseListQuery(q(''), opciones)
    expect(parsed.limit).toBe(airshotConfig.pagination.default_page_size)
    expect(parsed.sortBy).toBe('createdAt')
    expect(parsed.order).toBe('desc')
    expect(parsed.cursor).toBeNull()
  })

  it('acepta limit válido y order explícito', () => {
    const parsed = parseListQuery(q('limit=5&order=asc'), opciones)
    expect(parsed.limit).toBe(5)
    expect(parsed.order).toBe('asc')
  })

  it.each(['0', '-1', '1.5', 'abc'])('rechaza limit inválido "%s" (nunca recorta)', (limit) => {
    expectAppError(() => parseListQuery(q(`limit=${limit}`), opciones), 'VALIDATION_ERROR')
  })

  it('rechaza limit por encima de max_page_size', () => {
    expectAppError(
      () => parseListQuery(q(`limit=${airshotConfig.pagination.max_page_size + 1}`), opciones),
      'VALIDATION_ERROR',
    )
  })

  it('rechaza sortBy fuera de whitelist', () => {
    expectAppError(() => parseListQuery(q('sortBy=titleDesc'), opciones), 'VALIDATION_ERROR')
  })

  it('rechaza order inválido', () => {
    expectAppError(() => parseListQuery(q('order=up'), opciones), 'VALIDATION_ERROR')
  })

  it('acepta cursor con createdAt ISO válido', () => {
    const cursor = encodeCursorValue('2026-01-01T00:00:00.000Z', 'abc')
    expect(parseListQuery(q(`cursor=${encodeURIComponent(cursor)}`), opciones).cursor).toBe(cursor)
  })

  it.each([
    ['no-base64!', 'base64 inválido'],
    [Buffer.from('{"i":"x"}', 'utf8').toString('base64url'), 'sin v'],
    [encodeCursorValue('no-es-fecha', 'x'), 'createdAt no ISO'],
    [Buffer.from('null', 'utf8').toString('base64url'), 'forma nula'],
  ])('rechaza cursor malformado (%s)', (cursor) => {
    expectAppError(() => parseListQuery(q(`cursor=${encodeURIComponent(cursor)}`), opciones), 'VALIDATION_ERROR')
  })
})

describe('buildPage + cursores', () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({ id: `id-${i}`, createdAt: `2026-01-0${i + 1}T00:00:00.000Z` }))

  it('sin fila extra no emite nextCursor', () => {
    const page = buildPage(rows.slice(0, 2), 2, (r) => ({ v: r.createdAt }))
    expect(page.items).toHaveLength(2)
    expect(page.nextCursor).toBeNull()
  })

  it('con fila extra recorta y emite cursor con (v,id) de la última fila devuelta', () => {
    const page = buildPage(rows, 2, (r) => ({ v: r.createdAt }))
    expect(page.items.map((r) => r.id)).toEqual(['id-0', 'id-1'])
    const decoded = decodeCursor(page.nextCursor as string)
    expect(decoded.v).toBe(rows[1].createdAt)
    expect(decoded.i).toBe('id-1')
  })

  it('roundtrip encode/decode', () => {
    const cursor = encodeCursorValue(7, 'scene-x')
    expect(decodeCursor(cursor)).toEqual({ v: 7, i: 'scene-x' })
  })
})

describe('seek predicates', () => {
  it('createdAt desc usa lt o (eq + id lt)', () => {
    const where = seekCreatedAt('desc', '2026-01-01T00:00:00.000Z', 'a')
    expect(where.OR[0]).toEqual({ createdAt: { lt: new Date('2026-01-01T00:00:00.000Z') } })
    expect(where.OR[1]).toEqual({
      AND: [{ createdAt: { equals: new Date('2026-01-01T00:00:00.000Z') } }, { id: { lt: 'a' } }],
    })
  })

  it('orderIndex asc/desc', () => {
    expect(seekOrderIndex('desc', 3)).toEqual({ orderIndex: { lt: 3 } })
    expect(seekOrderIndex('asc', 3)).toEqual({ orderIndex: { gt: 3 } })
  })
})

describe('parseBasicPageQuery', () => {
  it('valida limit igual que la variante con sort', () => {
    expect(parseBasicPageQuery(q('limit=3')).limit).toBe(3)
    expectAppError(() => parseBasicPageQuery(q('limit=0')), 'VALIDATION_ERROR')
    expect(parseBasicPageQuery(q('cursor=')).cursor).toBeNull()
  })
})
