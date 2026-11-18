// AirShot — domain/reference-validator.ts (F4 §4.2 + Anexo C)
// Validación del JSON genérico de `Reference.attributes`. Dos pasadas:
//   1) JSON Schema v1 equivalente al Anexo C (forma) — aquí implementada como
//      pasada imperativa única (coste aceptado ~40 líneas; misma decisión que §4.2)
//      porque el contrato exige bytes/profundidad/code points que JSON Schema
//      draft-07 no expresa de forma portable.
//   2) límites de config (cero hardcoding) + denylist unión config ∪ schema,
//      comparada en minúsculas (nunca intersección).
// C-10: valores desconocidos pero válidos SE ACEPTAN (extensibilidad).

import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }
export type Attributes = { [k: string]: JsonValue }

const KEY_PATTERN = /^[a-z][a-zA-Z0-9]{0,31}$/

// Unión de denylists (config) con el enum del Anexo C — efectiva, nunca intersección
const SENSITIVE = new Set(airshotConfig.reference.sensitive_key_denied.map((k) => k.toLowerCase()))
const DANGEROUS = new Set(airshotConfig.reference.dangerous_key_denied.map((k) => k.toLowerCase()))

function fail(code: 'ATTRIBUTE_NAME' | 'SENSITIVE_KEY' | 'ATTRIBUTE_VALUE' | 'ATTRIBUTE_DEPTH' | 'ATTRIBUTE_LIMIT', detail: string, field?: string): AppError {
  return new AppError(code, detail, { field })
}

function checkKey(key: string, path: string): void {
  if (!KEY_PATTERN.test(key)) {
    throw fail('ATTRIBUTE_NAME', `clave "${key}" no cumple el patrón ^[a-z][a-zA-Z0-9]{0,31}$ (${path})`, key)
  }
  const lower = key.toLowerCase()
  if (SENSITIVE.has(lower)) {
    throw fail('SENSITIVE_KEY', `clave "${key}" está en la denylist de claves sensibles (${path})`, key)
  }
  if (DANGEROUS.has(lower)) {
    throw fail('ATTRIBUTE_NAME', `clave "${key}" está en la denylist de nombres peligrosos (${path})`, key)
  }
}

function codePoints(s: string): number {
  let n = 0
  for (const _ of s) n++ // iteración por code points (C-06)
  return n
}

function checkScalar(v: JsonValue, path: string): void {
  const t = typeof v
  if (t === 'string') {
    if (codePoints(v as string) > airshotConfig.reference.attributes_max_value_length) {
      throw fail('ATTRIBUTE_VALUE', `valor en ${path} supera attributes_max_value_length=${airshotConfig.reference.attributes_max_value_length}`)
    }
    return
  }
  if (t === 'number') {
    if (!Number.isFinite(v as number)) {
      throw fail('ATTRIBUTE_VALUE', `número no finito en ${path}`)
    }
    return
  }
  if (t === 'boolean' || v === null) return
  throw fail('ATTRIBUTE_VALUE', `tipo no permitido (${t}) en ${path}; escalares o arrays/objetos según Anexo C`)
}

function checkValue(v: JsonValue, depth: number, path: string): void {
  const { attributes_max_depth: maxDepth, attributes_max_array_items: maxItems, attributes_max_nested_fields: maxNested } = airshotConfig.reference
  if (Array.isArray(v)) {
    // m3 (ronda de corrección — Anexo C): arrays SOLO en el nivel raíz;
    // dentro del objeto anidado (profundidad ≥ 2) únicamente escalares.
    if (depth > 1) {
      throw fail('ATTRIBUTE_DEPTH', `array en ${path} no permitido dentro del objeto anidado (nivel 2 = solo escalares)`)
    }
    if (v.length > maxItems) {
      throw fail('ATTRIBUTE_VALUE', `array en ${path} supera attributes_max_array_items=${maxItems}`)
    }
    v.forEach((item, idx) => checkScalar(item, `${path}[${idx}]`))
    return
  }
  if (typeof v === 'object' && v !== null) {
    if (depth + 1 > maxDepth) {
      throw fail('ATTRIBUTE_DEPTH', `objeto en ${path} excede attributes_max_depth=${maxDepth} (solo un nivel de anidado)`)
    }
    const keys = Object.keys(v)
    if (keys.length > maxNested) {
      throw fail('ATTRIBUTE_LIMIT', `objeto anidado en ${path} supera attributes_max_nested_fields=${maxNested}`)
    }
    for (const k of keys) {
      checkKey(k, path)
      checkValue((v as Record<string, JsonValue>)[k], depth + 1, `${path}.${k}`)
    }
    return
  }
  checkScalar(v, path)
}

/** Valida `attributes` completa (C-02..C-12); acepta claves desconocidas válidas (C-10). */
export function validateAttributes(input: JsonValue): Attributes {
  const cfg = airshotConfig.reference
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw fail('ATTRIBUTE_VALUE', 'attributes debe ser un objeto JSON')
  }
  const obj = input as Attributes
  const keys = Object.keys(obj)
  if (keys.length > cfg.attributes_max_fields) {
    throw fail('ATTRIBUTE_LIMIT', `attributes supera attributes_max_fields=${cfg.attributes_max_fields}`)
  }
  const bytes = Buffer.byteLength(JSON.stringify(obj), 'utf8')
  if (bytes > cfg.attributes_max_json_bytes) {
    throw fail('ATTRIBUTE_LIMIT', `attributes serializado pesa ${bytes} bytes > attributes_max_json_bytes=${cfg.attributes_max_json_bytes}`)
  }
  for (const k of keys) {
    checkKey(k, 'attributes')
    checkValue(obj[k], 1, `attributes.${k}`)
  }
  return obj
}

/** Sella la versión del schema en escritura (C-11). */
export const ATTRIBUTES_SCHEMA_VERSION = 'v1' as const
