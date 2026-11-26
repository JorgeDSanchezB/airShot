import { describe, expect, it } from 'vitest'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { clampDuration, mapDuration } from '@/lib/airshot/domain/duration-mapper'

const { min_duration_seconds: min, max_duration_seconds: max } = airshotConfig.scene

describe('clampDuration', () => {
  it('respeta los límites de config', () => {
    expect(clampDuration(min - 10)).toBe(min)
    expect(clampDuration(max + 10)).toBe(max)
  })

  it('redondea al entero más cercano', () => {
    expect(clampDuration(6.4)).toBe(6)
    expect(clampDuration(6.5)).toBe(7)
  })
})

describe('mapDuration (ADR-009)', () => {
  it('lista continua (vacía) → clamp dentro de [min,max]', () => {
    expect(mapDuration(6, { supportedDurations: [] })).toBe(6)
    expect(mapDuration(1, { supportedDurations: [] })).toBe(min)
    expect(mapDuration(99, { supportedDurations: [] })).toBe(max)
  })

  it('lista soportada → valor más cercano', () => {
    const caps = { supportedDurations: [4, 6, 8] }
    expect(mapDuration(4, caps)).toBe(4)
    expect(mapDuration(6, caps)).toBe(6)
    expect(mapDuration(10, caps)).toBe(8)
  })

  it('empate → el menor (distancia mínima absoluta)', () => {
    const caps = { supportedDurations: [4, 6, 8] }
    expect(mapDuration(5, caps)).toBe(4) // 5 equidista de 4 y 6
    expect(mapDuration(7, caps)).toBe(6) // 7 equidista de 6 y 8
  })

  it('duración propuesta por debajo del mínimo → clamp antes de mapear', () => {
    expect(mapDuration(1, { supportedDurations: [4, 6] })).toBe(4)
  })

  it('respeta listas no ordenadas', () => {
    expect(mapDuration(7, { supportedDurations: [8, 4, 6] })).toBe(6)
  })
})
