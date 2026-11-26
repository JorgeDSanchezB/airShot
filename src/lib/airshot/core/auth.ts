// AirShot — core/auth.ts
// Sesión ligera de instancia única (§3.1.2 sin JWT/OAuth todavía).
// Compatible con Edge Runtime: solo Web Crypto (el middleware no puede importar node:crypto).
// - Modo abierto: sin AIRSHOT_API_TOKEN la API queda sin autenticación (uso local).
// - Con token: /api/v1/auth/unlock valida el token y fija la cookie `airshot_auth`
//   cuyo valor es HMAC-SHA256(token) — la cookie nunca contiene el token en claro.

export const AUTH_COOKIE = 'airshot_auth'
export const AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 días

const encoder = new TextEncoder()
const SESSION_MESSAGE = 'airshot-session-v1'

export function authRequired(): boolean {
  const token = process.env.AIRSHOT_API_TOKEN
  return token !== undefined && token.length > 0
}

/** Comparación de longitud constante (evita filtrar prefijos por timing). */
export function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

export async function sessionCookieValue(token: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(SESSION_MESSAGE))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function tokenMatches(candidate: string): Promise<boolean> {
  const token = process.env.AIRSHOT_API_TOKEN
  if (token === undefined || token.length === 0) return false
  return timingSafeEqual(candidate, token)
}

export async function isValidSession(cookieValue: string | undefined, token: string): Promise<boolean> {
  if (cookieValue === undefined || cookieValue.length === 0) return false
  return timingSafeEqual(cookieValue, await sessionCookieValue(token))
}
