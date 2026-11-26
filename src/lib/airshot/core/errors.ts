// AirShot — core/errors.ts
// Taxonomía canónica de tolerancia a fallos (F3 §3.1.1) + RFC 7807 Problem Details.
// Ningún catch vacío; ningún error sin clasificar; los valores por defecto solo
// aplican en el caso «ausente» y siempre documentados.

import { NextResponse } from 'next/server'
import { logger } from '@/lib/airshot/core/logger'

export type ErrorCode =
  // Datos (422)
  | 'VALIDATION_ERROR'
  | 'UNEXPECTED_FIELD'
  | 'ATTRIBUTE_LIMIT'
  | 'ATTRIBUTE_DEPTH'
  | 'ATTRIBUTE_NAME'
  | 'ATTRIBUTE_VALUE'
  | 'SENSITIVE_KEY'
  | 'REFERENCE_IMAGE_LIMIT'
  // Recurso (404)
  | 'NOT_FOUND'
  // Estado (409)
  | 'STATE_CONFLICT'
  | 'DELETION_FORBIDDEN'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'ASSEMBLY_INCOMPLETE_SCENES'
  // Proveedor (502/503/504)
  | 'PROVIDER_AUTH'
  | 'LLM_INVALID_OUTPUT'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_TIMEOUT'
  // Payload / medio (413 / 415)
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA'
  // Acceso (401 / 429)
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  // Crítico (500)
  | 'INTERNAL_ERROR'

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNEXPECTED_FIELD: 422,
  ATTRIBUTE_LIMIT: 422,
  ATTRIBUTE_DEPTH: 422,
  ATTRIBUTE_NAME: 422,
  ATTRIBUTE_VALUE: 422,
  SENSITIVE_KEY: 422,
  REFERENCE_IMAGE_LIMIT: 422,
  NOT_FOUND: 404,
  STATE_CONFLICT: 409,
  DELETION_FORBIDDEN: 409,
  PROVIDER_NOT_CONFIGURED: 409,
  ASSEMBLY_INCOMPLETE_SCENES: 409,
  PROVIDER_AUTH: 502,
  LLM_INVALID_OUTPUT: 502,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_RATE_LIMIT: 503,
  PROVIDER_TIMEOUT: 504,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  AUTH_REQUIRED: 401,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
}

const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_RATE_LIMIT',
  'RATE_LIMITED',
])

const TITLE_BY_CODE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Validation error',
  UNEXPECTED_FIELD: 'Unexpected field',
  ATTRIBUTE_LIMIT: 'Attribute limit exceeded',
  ATTRIBUTE_DEPTH: 'Attribute nesting too deep',
  ATTRIBUTE_NAME: 'Unsafe attribute key',
  ATTRIBUTE_VALUE: 'Invalid attribute value',
  SENSITIVE_KEY: 'Sensitive attribute key',
  REFERENCE_IMAGE_LIMIT: 'Reference image limit exceeded',
  NOT_FOUND: 'Not found',
  STATE_CONFLICT: 'State conflict',
  DELETION_FORBIDDEN: 'Deletion forbidden',
  PROVIDER_NOT_CONFIGURED: 'Provider not configured',
  ASSEMBLY_INCOMPLETE_SCENES: 'Incomplete scenes for assembly',
  PROVIDER_AUTH: 'Provider authorization failed',
  LLM_INVALID_OUTPUT: 'LLM produced invalid output',
  PROVIDER_UNAVAILABLE: 'Provider unavailable',
  PROVIDER_RATE_LIMIT: 'Provider rate limit',
  PROVIDER_TIMEOUT: 'Provider timeout',
  PAYLOAD_TOO_LARGE: 'Payload too large',
  UNSUPPORTED_MEDIA: 'Unsupported media type',
  AUTH_REQUIRED: 'Authentication required',
  RATE_LIMITED: 'Rate limit exceeded',
  INTERNAL_ERROR: 'Internal error',
}

export type ProblemExt = {
  detail?: string
  provider?: string
  sceneId?: string
  projectId?: string
  jobId?: string
  field?: string
  hints?: string[]
}

export type Problem = {
  type: string
  title: string
  status: number
  detail: string
  code: ErrorCode
  retryable: boolean
  instance?: string
  traceId?: string
} & ProblemExt

export class AppError extends Error {
  readonly problem: Problem

  constructor(code: ErrorCode, detail: string, ext: ProblemExt = {}) {
    super(detail)
    this.name = 'AppError'
    const status = STATUS_BY_CODE[code]
    this.problem = {
      type: `https://airshot.local/problems/${code.toLowerCase()}`,
      title: TITLE_BY_CODE[code],
      status,
      detail,
      code,
      retryable: RETRYABLE_CODES.has(code),
      ...ext,
    }
  }
}

/** Excepción para reintentos internos del adaptador (no sale al cliente tal cual). */
export class TransientProviderError extends Error {
  constructor(
    message: string,
    readonly kind: 'timeout' | 'unavailable' | 'rate_limit',
    readonly provider: string,
    readonly causeDetail?: string,
  ) {
    super(message)
    this.name = 'TransientProviderError'
  }

  toAppError(): AppError {
    const code: ErrorCode = this.kind === 'timeout' ? 'PROVIDER_TIMEOUT' : this.kind === 'rate_limit' ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_UNAVAILABLE'
    return new AppError(code, this.message, { provider: this.provider })
  }
}

/** Error de autorización del proveedor (401/403 remotos: sin reintentos). */
export class ProviderAuthError extends Error {
  constructor(message: string, readonly provider: string) {
    super(message)
    this.name = 'ProviderAuthError'
  }

  toAppError(): AppError {
    return new AppError('PROVIDER_AUTH', this.message, {
      provider: this.provider,
      hints: ['Corrige la API key en Configuración → Proveedores y vuelve a probarla.'],
    })
  }
}

export function problemResponse(err: unknown, traceId: string, instance: string): NextResponse {
  let problem: Problem
  if (err instanceof AppError) {
    problem = { ...err.problem, traceId, instance }
  } else if (err instanceof SyntaxError) {
    problem = new AppError('VALIDATION_ERROR', `JSON malformado: ${err.message}`).problem
    problem.traceId = traceId
    problem.instance = instance
  } else {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    problem = new AppError('INTERNAL_ERROR', detail).problem
    problem.traceId = traceId
    problem.instance = instance
  }
  // Log de servidor: nunca API keys (se enmascaran antes de llegar aquí)
  logger[problem.status >= 500 ? 'error' : 'warn']('http.problem', {
    traceId,
    code: problem.code,
    status: problem.status,
    instance,
    detail: problem.detail,
  })
  return NextResponse.json(problem, {
    status: problem.status,
    headers: { 'content-type': 'application/problem+json; charset=utf-8' },
  })
}
