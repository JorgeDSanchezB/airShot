// POST /api/v1/auth/logout — borra la cookie de sesión (idempotente, público).

import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/airshot/core/http'
import { AUTH_COOKIE } from '@/lib/airshot/core/auth'

export const POST = withRoute(async () => {
  const res = NextResponse.json({ ok: true })
  res.cookies.set({ name: AUTH_COOKIE, value: '', httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 })
  return res
})
