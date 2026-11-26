// AirShot — core/http.ts
// Envoltorio de route handlers (presentation layer de §6.1 adaptada a Next.js 16):
// - traceId por request (crypto.randomUUID)
// - auth stub §3.1.2: get_current_user → LocalUser (hueco JWT/OAuth sin tocar controllers)
// - body JSON con tope app.max_body_bytes (413 PAYLOAD_TOO_LARGE)
// - validación zod con extra=forbid (C-01): unknown key → UNEXPECTED_FIELD
// - todo error responde RFC 7807 (problem+json), sin ocultamiento

import { NextRequest, NextResponse } from 'next/server'
import type { ZodError, ZodType } from 'zod'
import { randomUUID } from 'node:crypto'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError, problemResponse } from '@/lib/airshot/core/errors'
import { parseJsonStrict } from '@/lib/airshot/core/json'
import { enforceRateLimit } from '@/lib/airshot/core/rate-limit'
import { logger } from '@/lib/airshot/core/logger'
import { runWithTraceContext } from '@/lib/airshot/core/context'
import { incCounter, normalizeRoute } from '@/lib/airshot/core/metrics'

export type LocalUser = { id: string }

/** §3.1.2: hoy devuelve el usuario local único; mañana JWT/OAuth aquí. */
export function getCurrentUser(): LocalUser {
  return { id: airshotConfig.app.local_user_id }
}

export type RouteCtx = { traceId: string; user: LocalUser }

/** Contexto de rutas SIN segmentos dinámicos (Next pasa params vacío). */
export type StaticRouteCtx = { params?: Promise<unknown> }

export function withRoute<Ctx>(
  handler: (req: NextRequest, ctx: RouteCtx & Ctx) => Promise<NextResponse | Response>,
): (req: NextRequest, seg: Ctx) => Promise<Response> {
  return async (req: NextRequest, seg: Ctx): Promise<Response> => {
    const traceId = randomUUID()
    const user = getCurrentUser() // hook de auth (§3.1.2): presente en todas las rutas
    const instance = new URL(req.url).pathname
    const startedAt = Date.now()
    try {
      enforceRateLimit(req.headers, req.method)
      const res = await runWithTraceContext({ traceId }, () => handler(req, { traceId, user, ...seg }))
      res.headers.set('x-trace-id', traceId)
      incCounter('http_requests_total', { method: req.method, route: normalizeRoute(instance), status: String(res.status) })
      logger.debug('http.request', {
        traceId,
        method: req.method,
        path: instance,
        status: res.status,
        ms: Date.now() - startedAt,
      })
      return res as Response
    } catch (err) {
      const res = problemResponse(err, traceId, instance)
      incCounter('http_requests_total', { method: req.method, route: normalizeRoute(instance), status: String(res.status) })
      return res
    }
  }
}

function zodToProblem(err: ZodError): AppError {
  const hasUnexpected = err.issues.some((i) => i.code === 'unrecognized_keys')
  const code = hasUnexpected ? 'UNEXPECTED_FIELD' : 'VALIDATION_ERROR'
  const hints = err.issues.map((i) => {
    const path = i.path.join('.')
    return path ? `${path}: ${i.message}` : i.message
  })
  const first = err.issues[0]
  const field = first && first.path.length > 0 ? first.path.join('.') : undefined
  return new AppError(code, first ? first.message : 'validation error', { field, hints })
}

/** Lee y valida el body JSON con schema estricto (C-01: claves desconocidas ⇒ 422). */
export async function readJsonBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > airshotConfig.app.max_body_bytes) {
    throw new AppError('PAYLOAD_TOO_LARGE', `body de ${contentLength} bytes supera app.max_body_bytes=${airshotConfig.app.max_body_bytes}`)
  }
  const text = await req.text()
  // m8 (ronda de corrección): cuerpos chunked sin content-length también se acotan tras la lectura
  if (text.length > airshotConfig.app.max_body_bytes) {
    throw new AppError('PAYLOAD_TOO_LARGE', `body de ${text.length} caracteres supera app.max_body_bytes=${airshotConfig.app.max_body_bytes}`)
  }
  if (text.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'cuerpo JSON vacío', { hints: ['Envía un objeto JSON válido.'] })
  }
  let json: unknown
  try {
    json = parseJsonStrict(text)
  } catch (err) {
    if (err instanceof AppError) throw err // C-13 (clave duplicada) llega ya clasificado
    throw new AppError('VALIDATION_ERROR', `JSON malformado: ${(err as Error).message}`)
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw zodToProblem(parsed.error)
  }
  return parsed.data
}

export function okJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

export function noContent(): Response {
  return new NextResponse(null, { status: 204 })
}
