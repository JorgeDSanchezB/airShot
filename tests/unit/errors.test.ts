import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/airshot/core/errors'

describe('taxonomía de errores (F3 §3.1.1)', () => {
  it.each([
    ['VALIDATION_ERROR', 422, false],
    ['UNEXPECTED_FIELD', 422, false],
    ['SENSITIVE_KEY', 422, false],
    ['REFERENCE_IMAGE_LIMIT', 422, false],
    ['NOT_FOUND', 404, false],
    ['STATE_CONFLICT', 409, false],
    ['PROVIDER_NOT_CONFIGURED', 409, false],
    ['ASSEMBLY_INCOMPLETE_SCENES', 409, false],
    ['PROVIDER_AUTH', 502, false],
    ['LLM_INVALID_OUTPUT', 502, false],
    ['PROVIDER_UNAVAILABLE', 503, true],
    ['PROVIDER_RATE_LIMIT', 503, true],
    ['PROVIDER_TIMEOUT', 504, true],
    ['PAYLOAD_TOO_LARGE', 413, false],
    ['UNSUPPORTED_MEDIA', 415, false],
    ['AUTH_REQUIRED', 401, false],
    ['RATE_LIMITED', 429, true],
    ['INTERNAL_ERROR', 500, false],
  ] as const)('%s → HTTP %i (retryable=%s)', (code, status, retryable) => {
    const problem = new AppError(code, 'detalle').problem
    expect(problem.code).toBe(code)
    expect(problem.status).toBe(status)
    expect(problem.retryable).toBe(retryable)
    expect(problem.title.length).toBeGreaterThan(0)
    expect(problem.type).toContain(code.toLowerCase())
  })

  it('preserva extensiones del problem (field, hints, provider, ids)', () => {
    const problem = new AppError('VALIDATION_ERROR', 'x', { field: 'limit', hints: ['a'], projectId: 'p1' }).problem
    expect(problem.field).toBe('limit')
    expect(problem.hints).toEqual(['a'])
    expect(problem.projectId).toBe('p1')
  })
})
