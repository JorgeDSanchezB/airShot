// AirShot — core/json.ts
// C-13 (§4.2): parser JSON con detección explícita de claves duplicadas.
// JSON.parse de V8 aplica "última gana" en silencio; el contrato exige rechazo.
// Parser de descenso minimal (mismos valores que JSON.parse, rechaza duplicados).

import { AppError } from '@/lib/airshot/core/errors'

type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

class JsonCursor {
  constructor(readonly text: string, public pos = 0) {}
  peek(): string { return this.text[this.pos] ?? '' }
  eof(): boolean { return this.pos >= this.text.length }
}

function skipWs(c: JsonCursor): void {
  while (!c.eof() && /[\s]/.test(c.peek())) c.pos++
}

function parseValue(c: JsonCursor): Json {
  skipWs(c)
  const ch = c.peek()
  if (ch === '{') return parseObject(c)
  if (ch === '[') return parseArray(c)
  if (ch === '"') return parseString(c)
  if (ch === 't' || ch === 'f') return parseBool(c)
  if (ch === 'n') return parseNull(c)
  return parseNumber(c)
}

function expect(c: JsonCursor, ch: string): void {
  if (c.peek() !== ch) {
    throw new SyntaxError(`expected '${ch}' at ${c.pos}`)
  }
  c.pos++
}

function parseObject(c: JsonCursor): Json {
  expect(c, '{')
  const obj: Record<string, Json> = {}
  const seen = new Set<string>()
  skipWs(c)
  if (c.peek() === '}') { c.pos++; return obj }
  for (;;) {
    skipWs(c)
    const key = parseString(c)
    // C-13: duplicado en el mismo nivel ⇒ rechazo explícito, nunca "última gana"
    if (seen.has(key)) {
      throw new AppError('VALIDATION_ERROR', `duplicate object key "${key}" (C-13)`, {
        detail: `El JSON contiene la clave "${key}" duplicada al mismo nivel; el contrato la rechaza en vez de aplicar la última.`,
        field: key,
      })
    }
    seen.add(key)
    skipWs(c)
    expect(c, ':')
    obj[key] = parseValue(c)
    skipWs(c)
    if (c.peek() === ',') { c.pos++; continue }
    expect(c, '}')
    return obj
  }
}

function parseArray(c: JsonCursor): Json {
  expect(c, '[')
  const arr: Json[] = []
  skipWs(c)
  if (c.peek() === ']') { c.pos++; return arr }
  for (;;) {
    arr.push(parseValue(c))
    skipWs(c)
    if (c.peek() === ',') { c.pos++; continue }
    expect(c, ']')
    return arr
  }
}

function parseString(c: JsonCursor): string {
  expect(c, '"')
  let out = ''
  for (;;) {
    if (c.eof()) throw new SyntaxError('unterminated string')
    const ch = c.text[c.pos++]
    if (ch === '"') return out
    if (ch === '\\') {
      const esc = c.text[c.pos++]
      switch (esc) {
        case '"': out += '"'; break
        case '\\': out += '\\'; break
        case '/': out += '/'; break
        case 'b': out += '\b'; break
        case 'f': out += '\f'; break
        case 'n': out += '\n'; break
        case 'r': out += '\r'; break
        case 't': out += '\t'; break
        case 'u': {
          const hex = c.text.slice(c.pos, c.pos + 4)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new SyntaxError('bad unicode escape')
          c.pos += 4
          out += String.fromCharCode(parseInt(hex, 16))
          break
        }
        default: throw new SyntaxError(`bad escape '\\${esc}'`)
      }
    } else {
      out += ch
    }
  }
}

function parseBool(c: JsonCursor): boolean {
  if (c.text.startsWith('true', c.pos)) { c.pos += 4; return true }
  if (c.text.startsWith('false', c.pos)) { c.pos += 5; return false }
  throw new SyntaxError('bad literal')
}

function parseNull(c: JsonCursor): null {
  if (c.text.startsWith('null', c.pos)) { c.pos += 4; return null }
  throw new SyntaxError('bad literal')
}

function parseNumber(c: JsonCursor): number {
  const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(c.text.slice(c.pos))
  if (!m) throw new SyntaxError('bad number')
  c.pos += m[0].length
  const n = Number(m[0])
  if (!Number.isFinite(n)) throw new SyntaxError('non-finite number')
  return n
}

/** JSON.parse estricto: rechaza claves duplicadas (C-13) y no-finitos (C-02). */
export function parseJsonStrict(text: string): Json {
  const c = new JsonCursor(text)
  const v = parseValue(c)
  skipWs(c)
  if (!c.eof()) throw new SyntaxError('trailing content')
  return v
}

/** Extrae el primer objeto/array JSON de un texto (tolera bardas ```json ... ```). */
export function extractJsonLoose(text: string): Json {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.search(/[{[]/)
  if (start < 0) throw new SyntaxError('no JSON object found')
  const endIdx = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'))
  return parseJsonStrict(candidate.slice(start, endIdx + 1))
}
