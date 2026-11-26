import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/airshot/core/errors'
import { extractJsonLoose, parseJsonStrict } from '@/lib/airshot/core/json'

describe('parseJsonStrict (C-13)', () => {
  it('parsea los valores JSON estándar', () => {
    expect(parseJsonStrict('{"a":1,"b":[true,null,"x"],"c":{"d":-2.5}}')).toEqual({
      a: 1,
      b: [true, null, 'x'],
      c: { d: -2.5 },
    })
  })

  it('rechaza claves duplicadas al mismo nivel con AppError VALIDATION_ERROR', () => {
    try {
      parseJsonStrict('{"a":1,"a":2}')
      throw new Error('se esperaba AppError')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).problem.code).toBe('VALIDATION_ERROR')
      expect((err as AppError).problem.detail).toContain('"a"')
    }
  })

  it('permite la misma clave en objetos distintos', () => {
    expect(parseJsonStrict('{"x":{"a":1},"y":{"a":2}}')).toEqual({ x: { a: 1 }, y: { a: 2 } })
  })

  it('rechaza trailing content y JSON malformado', () => {
    expect(() => parseJsonStrict('{} {}')).toThrowError(SyntaxError)
    expect(() => parseJsonStrict('{"a":}')).toThrowError(SyntaxError)
    expect(() => parseJsonStrict('')).toThrowError()
  })
})

describe('extractJsonLoose (salida de LLM)', () => {
  it('extrae JSON envuelto en bardas ```json', () => {
    const raw = 'Aquí tienes:\n```json\n{"scenes":[{"x":1}]}\n```\n'
    expect(extractJsonLoose(raw)).toEqual({ scenes: [{ x: 1 }] })
  })

  it('extrae el objeto aunque haya texto alrededor', () => {
    expect(extractJsonLoose('bla {"a": 2} bla')).toEqual({ a: 2 })
  })

  it('sin JSON → SyntaxError', () => {
    expect(() => extractJsonLoose('sin nada')).toThrowError(SyntaxError)
  })
})
