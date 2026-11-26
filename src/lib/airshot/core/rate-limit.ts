// AirShot — core/rate-limit.ts
// Límite de peticiones por cliente (F4 §3.1.4 riesgo A-07) — en memoria, por proceso.
// Limitación documentada: single-process (el runner de jobs ya asume lo mismo);
// con varias instancias haría falta Redis/upstash, fuera del alcance actual.
// Bucket «sensitive» (métodos mutantes: POST/PUT/PATCH/DELETE) usa
// security.rate_limit.max_sensitive_requests; el resto, max_requests.

import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_BUCKETS = 10_000
let lastSweep = 0

function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'local'
  return ip.slice(0, 64)
}

function sweep(now: number): void {
  if (now - lastSweep < 60_000 && buckets.size < MAX_BUCKETS) return
  lastSweep = now
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/** Lanza AppError RATE_LIMITED (429) si el cliente excede la ventana configurada. */
export function enforceRateLimit(headers: Headers, method: string): void {
  const cfg = airshotConfig.security.rate_limit
  if (!cfg.enabled) return

  const sensitive = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS'
  const max = sensitive ? cfg.max_sensitive_requests : cfg.max_requests
  const key = `${clientKey(headers)}:${sensitive ? 'sensitive' : 'general'}`
  const now = Date.now()
  const windowMs = cfg.window_seconds * 1000

  const bucket = buckets.get(key)
  if (bucket === undefined || bucket.resetAt <= now) {
    sweep(now)
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return
  }
  bucket.count++
  if (bucket.count > max) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    throw new AppError('RATE_LIMITED', `límite de ${max} peticiones/${cfg.window_seconds}s excedido (${sensitive ? 'operaciones mutantes' : 'lecturas'})`, {
      hints: [`Reintenta en ~${retryAfter}s.`],
    })
  }
}

/** Solo para tests: vacía los buckets entre casos. */
export function resetRateLimitBuckets(): void {
  buckets.clear()
  lastSweep = 0
}
