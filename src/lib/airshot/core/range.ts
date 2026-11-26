// AirShot — core/range.ts
// Semántica HTTP Range/ETag para la entrega de medios (§Media).
// Solo se soporta un rango simple (`bytes=a-b`); cabeceras multi-rango o
// malformadas se ignoran (respuesta 200 completa), como permite RFC 9110.

export type ByteRange = { start: number; end: number }
export type ParsedRange = ByteRange | 'unsatisfiable' | null

export function parseRange(header: string | null, size: number): ParsedRange {
  if (header === null || header.length === 0) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (match === null) return null
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return null

  if (rawStart === '') {
    // sufijo: últimos N bytes
    const suffix = Number(rawEnd)
    if (suffix <= 0) return 'unsatisfiable'
    if (size === 0) return 'unsatisfiable'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }

  const start = Number(rawStart)
  const end = rawEnd === '' ? size - 1 : Number(rawEnd)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null
  if (start >= size || start > end) return 'unsatisfiable'
  return { start, end: Math.min(end, size - 1) }
}

export function makeEtag(size: number, mtimeMs: number): string {
  return `W/"${size}-${Math.floor(mtimeMs)}"`
}

/** Comparación débil: `W/` se ignora; admite lista separada por comas y `*`. */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (ifNoneMatch === null) return false
  const normalize = (value: string) => value.trim().replace(/^W\//, '')
  const target = normalize(etag)
  return ifNoneMatch.split(',').some((candidate) => {
    const value = normalize(candidate)
    return value === '*' || value === target
  })
}
