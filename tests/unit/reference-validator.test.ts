import { describe, expect, it } from 'vitest'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { validateAttributes } from '@/lib/airshot/domain/reference-validator'

const cfg = airshotConfig.reference

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn()
  } catch (err) {
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).problem.code).toBe(code)
    return
  }
  throw new Error(`se esperaba AppError ${code}`)
}

describe('validateAttributes (C-01..C-13)', () => {
  it('acepta escalares y claves desconocidas válidas (C-10)', () => {
    const input = { hairColor: 'black', age: 33, visible: true, notes: null, hairColor2: 'blonde' }
    expect(validateAttributes(input)).toEqual(input)
  })

  it('acepta arrays de escalares en el nivel raíz', () => {
    expect(validateAttributes({ traits: ['loud', 'kind', 3, true] })).toEqual({ traits: ['loud', 'kind', 3, true] })
  })

  it('acepta un nivel de anidado con escalares', () => {
    const input = { face: { eyes: 'green', freckles: false } }
    expect(validateAttributes(input)).toEqual(input)
  })

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'x'],
    ['number', 3],
  ])('rechaza attributes no-objeto (%s)', (_n, input) => {
    expectCode(() => validateAttributes(input as never), 'ATTRIBUTE_VALUE')
  })

  it('rechaza claves que no cumplen el patrón', () => {
    expectCode(() => validateAttributes({ BadStart: 'x' }), 'ATTRIBUTE_NAME')
    expectCode(() => validateAttributes({ 'kebab-case': 'x' }), 'ATTRIBUTE_NAME')
    expectCode(() => validateAttributes({ a: 1, ...Object.fromEntries([['k'.repeat(33), 1]]) }), 'ATTRIBUTE_NAME')
  })

  it('rechaza claves sensibles sin importar mayúsculas (unión de denylists)', () => {
    expectCode(() => validateAttributes({ password: 'x' }), 'SENSITIVE_KEY')
    // mayúscula inicial: la rechaza antes el patrón de nombre (también seguro)
    expectCode(() => validateAttributes({ Password: 'x' }), 'ATTRIBUTE_NAME')
  })

  it('rechaza nombres peligrosos (prototype/constructor/hasOwnProperty)', () => {
    expectCode(() => validateAttributes({ constructor: 'x' }), 'ATTRIBUTE_NAME')
    expectCode(() => validateAttributes({ hasOwnProperty: 'x' }), 'ATTRIBUTE_NAME')
  })

  it('rechaza objeto anidado demasiado profundo', () => {
    expectCode(() => validateAttributes({ a: { b: { c: 1 } } }), 'ATTRIBUTE_DEPTH')
  })

  it('rechaza arrays dentro del objeto anidado (nivel 2 = solo escalares)', () => {
    expectCode(() => validateAttributes({ face: { traits: ['a'] } }), 'ATTRIBUTE_DEPTH')
  })

  it('rechaza array con demasiados elementos', () => {
    const big = Array.from({ length: cfg.attributes_max_array_items + 1 }, () => 'x')
    expectCode(() => validateAttributes({ traits: big }), 'ATTRIBUTE_VALUE')
  })

  it('rechaza más campos de los permitidos', () => {
    const many = Object.fromEntries(Array.from({ length: cfg.attributes_max_fields + 1 }, (_, i) => [`k${i}`, 1]))
    expectCode(() => validateAttributes(many), 'ATTRIBUTE_LIMIT')
  })

  it('rechaza más campos anidados de los permitidos', () => {
    const nested = Object.fromEntries(Array.from({ length: cfg.attributes_max_nested_fields + 1 }, (_, i) => [`f${i}`, 1]))
    expectCode(() => validateAttributes({ face: nested }), 'ATTRIBUTE_LIMIT')
  })

  it('rechaza payload serializado por encima de attributes_max_json_bytes', () => {
    // 32 claves × arrays de 8 valores de 200 chars ≈ 51 KB > 16 KB
    const arr = Array.from({ length: cfg.attributes_max_array_items }, () => 'x'.repeat(cfg.attributes_max_value_length))
    const obj = Object.fromEntries(Array.from({ length: cfg.attributes_max_fields }, (_, i) => [`k${i}`, arr]))
    expectCode(() => validateAttributes(obj), 'ATTRIBUTE_LIMIT')
  })

  it('rechaza números no finitos (C-02)', () => {
    expectCode(() => validateAttributes({ age: Number.POSITIVE_INFINITY }), 'ATTRIBUTE_VALUE')
    expectCode(() => validateAttributes({ age: Number.NaN }), 'ATTRIBUTE_VALUE')
  })

  it('cuenta code points (C-06): un emoji vale 1, se acepta en el límite exacto', () => {
    const atLimit = '😀'.repeat(cfg.attributes_max_value_length)
    expect(validateAttributes({ face: atLimit })).toEqual({ face: atLimit })
    expectCode(() => validateAttributes({ face: `${atLimit}😀` }), 'ATTRIBUTE_VALUE')
  })
})
