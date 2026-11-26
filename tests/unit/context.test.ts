// Unit: contexto de traza (AsyncLocalStorage) y traceparent W3C.
import { describe, expect, it } from 'vitest'
import { currentTraceId, runWithTraceContext, traceparentOf } from '@/lib/airshot/core/context'

describe('context · traceparent W3C', () => {
  it('formatea 00-<32hex>-<16hex>-01 y normaliza el traceId', () => {
    const tp = traceparentOf('ABC-123')
    expect(tp).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    expect(tp.slice(3, 35)).toBe('abc123'.padStart(32, '0'))
  })

  it('acepta spanId explícito', () => {
    expect(traceparentOf('f'.repeat(32), '0'.repeat(16))).toBe(`00-${'f'.repeat(32)}-${'0'.repeat(16)}-01`)
  })
})

describe('context · AsyncLocalStorage', () => {
  it('fuera de un request no hay traza activa', () => {
    expect(currentTraceId()).toBeNull()
  })

  it('propaga el traceId a través de awaits dentro del contexto y no fuera', async () => {
    const inside = await runWithTraceContext({ traceId: 'corr-1' }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1))
      return currentTraceId()
    })
    expect(inside).toBe('corr-1')
    expect(currentTraceId()).toBeNull()
  })
})
