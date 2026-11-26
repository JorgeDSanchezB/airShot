import { describe, expect, it } from 'vitest'
import { etagMatches, makeEtag, parseRange } from '@/lib/airshot/core/range'

describe('core/range (HTTP Range/ETag)', () => {
  it('sin cabecera o cabecera vacía ⇒ respuesta completa', () => {
    expect(parseRange(null, 100)).toBeNull()
    expect(parseRange('', 100)).toBeNull()
  })

  it('ignora formatos no soportados (multi-rango, unidades desconocidas)', () => {
    expect(parseRange('bytes=0-1,5-6', 100)).toBeNull()
    expect(parseRange('items=0-1', 100)).toBeNull()
    expect(parseRange('bytes=abc-def', 100)).toBeNull()
  })

  it('rango con inicio y fin', () => {
    expect(parseRange('bytes=0-99', 100)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 })
  })

  it('fin abierto y fin que excede el tamaño se recortan', () => {
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=0-1000', 100)).toEqual({ start: 0, end: 99 })
  })

  it('rango sufijo (últimos N bytes)', () => {
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=-0', 100)).toBe('unsatisfiable')
  })

  it('rangos insatisfacibles', () => {
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable')
    expect(parseRange('bytes=5-2', 100)).toBe('unsatisfiable')
    expect(parseRange('bytes=0-0', 0)).toBe('unsatisfiable')
    expect(parseRange('bytes=-5', 0)).toBe('unsatisfiable')
  })

  it('ETag estable por (tamaño, mtime en ms enteros)', () => {
    const etag = makeEtag(1234, 1700000000123.9)
    expect(etag).toBe('W/"1234-1700000000123"')
    expect(makeEtag(1234, 1700000000123)).toBe(etag)
    expect(makeEtag(1234, 1700000000124)).not.toBe(etag)
  })

  it('If-None-Match: débil, lista y comodín', () => {
    const etag = makeEtag(10, 1000)
    expect(etagMatches(null, etag)).toBe(false)
    expect(etagMatches(etag, etag)).toBe(true)
    expect(etagMatches(`"otro", ${etag}`, etag)).toBe(true)
    expect(etagMatches('W/"10-1000"', etag)).toBe(true)
    expect(etagMatches('*', etag)).toBe(true)
    expect(etagMatches('W/"10-999"', etag)).toBe(false)
  })
})
