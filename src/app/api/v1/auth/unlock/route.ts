// POST /api/v1/auth/unlock — valida AIRSHOT_API_TOKEN y emite la cookie de sesión.
// POST /api/v1/auth/logout vive en ../logout/route.ts.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AppError } from '@/lib/airshot/core/errors'
import { readJsonBody, withRoute } from '@/lib/airshot/core/http'
import {
  AUTH_COOKIE,
  AUTH_COOKIE_MAX_AGE,
  authRequired,
  sessionCookieValue,
  tokenMatches,
} from '@/lib/airshot/core/auth'

const UnlockRequest = z.object({ token: z.string().min(1).max(512) }).strict()

export const POST = withRoute(async (req: NextRequest) => {
  if (!authRequired()) {
    throw new AppError('STATE_CONFLICT', 'AIRSHOT_API_TOKEN no está definido: la API ya está abierta (modo local).', {
      hints: ['Define AIRSHOT_API_TOKEN en .env y reinicia para exigir autenticación.'],
    })
  }
  const { token } = await readJsonBody(req, UnlockRequest)
  if (!(await tokenMatches(token))) {
    throw new AppError('AUTH_REQUIRED', 'Token incorrecto.', { field: 'token' })
  }
  const res = NextResponse.json({ ok: true })
  res.cookies.set({
    name: AUTH_COOKIE,
    value: await sessionCookieValue(token),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE,
  })
  return res
})
