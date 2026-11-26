import { afterEach, describe, expect, it, vi } from 'vitest'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { enforceRateLimit, resetRateLimitBuckets } from '@/lib/airshot/core/rate-limit'

const cfg = airshotConfig.security.rate_limit
const ORIGINAL = { ...cfg }

afterEach(() => {
  Object.assign(cfg, ORIGINAL)
  resetRateLimitBuckets()
  vi.useRealTimers()
})

function headers(ip: string): Headers {
  return new Headers({ 'x-forwarded-for': `${ip}, 10.0.0.1` })
}

describe('core/rate-limit (429 RATE_LIMITED)', () => {
  it('no limita si está desactivado en config', () => {
    cfg.enabled = false
    for (let i = 0; i < 500; i++) enforceRateLimit(headers('1.1.1.1'), 'GET')
  })

  it('permite hasta max_requests lecturas y rechaza la siguiente', () => {
    cfg.enabled = true
    cfg.max_requests = 2
    enforceRateLimit(headers('2.2.2.2'), 'GET')
    enforceRateLimit(headers('2.2.2.2'), 'GET')
    try {
      enforceRateLimit(headers('2.2.2.2'), 'GET')
      expect.unreachable('debía lanzar RATE_LIMITED')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      const problem = (err as AppError).problem
      expect(problem.code).toBe('RATE_LIMITED')
      expect(problem.status).toBe(429)
      expect(problem.retryable).toBe(true)
    }
  })

  it('las mutaciones usan el bucket sensible (independiente del general)', () => {
    cfg.enabled = true
    cfg.max_requests = 100
    cfg.max_sensitive_requests = 1
    enforceRateLimit(headers('3.3.3.3'), 'POST')
    expect(() => enforceRateLimit(headers('3.3.3.3'), 'POST')).toThrow(/operaciones mutantes/)
    // Lecturas del mismo cliente no se ven afectadas por el bucket sensible
    for (let i = 0; i < 5; i++) enforceRateLimit(headers('3.3.3.3'), 'GET')
  })

  it('cada cliente tiene su propia ventana', () => {
    cfg.enabled = true
    cfg.max_requests = 1
    enforceRateLimit(headers('4.4.4.4'), 'GET')
    expect(() => enforceRateLimit(headers('4.4.4.4'), 'GET')).toThrow(AppError)
    enforceRateLimit(headers('5.5.5.5'), 'GET')
  })

  it('la ventana se reinicia al pasar window_seconds', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    cfg.enabled = true
    cfg.max_requests = 1
    cfg.window_seconds = 60
    enforceRateLimit(headers('6.6.6.6'), 'GET')
    expect(() => enforceRateLimit(headers('6.6.6.6'), 'GET')).toThrow(AppError)
    vi.setSystemTime(Date.now() + 61_000)
    enforceRateLimit(headers('6.6.6.6'), 'GET')
  })
})
