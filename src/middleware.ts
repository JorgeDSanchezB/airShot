// AirShot — middleware (Edge): auth de instancia sobre /api/v1/**.
// Sin AIRSHOT_API_TOKEN ⇒ modo abierto (local single-user). Con token ⇒ exige la
// cookie de sesión emitida por /api/v1/auth/unlock; si falta o no coincide responde
// RFC 7807 (AUTH_REQUIRED, 401) antes de tocar cualquier route handler.

import { NextRequest, NextResponse } from 'next/server'
import { AUTH_COOKIE, authRequired, isValidSession } from '@/lib/airshot/core/auth'

const PUBLIC_API_PATHS = new Set(['/api/v1/auth/unlock', '/api/v1/auth/logout'])

export async function middleware(req: NextRequest) {
  if (!authRequired()) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (PUBLIC_API_PATHS.has(pathname)) return NextResponse.next()

  const token = process.env.AIRSHOT_API_TOKEN as string
  const cookie = req.cookies.get(AUTH_COOKIE)?.value
  if (cookie !== undefined && (await isValidSession(cookie, token))) {
    return NextResponse.next()
  }

  const traceId = crypto.randomUUID()
  const problem = {
    type: 'https://airshot.local/problems/auth_required',
    title: 'Authentication required',
    status: 401,
    detail: 'La API está protegida: desbloquea la sesión en /unlock con AIRSHOT_API_TOKEN.',
    code: 'AUTH_REQUIRED',
    retryable: false,
    traceId,
    instance: pathname,
  }
  return NextResponse.json(problem, {
    status: 401,
    headers: { 'content-type': 'application/problem+json; charset=utf-8', 'x-trace-id': traceId },
  })
}

export const config = {
  matcher: ['/api/v1/:path*'],
}
