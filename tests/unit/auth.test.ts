import { afterEach, describe, expect, it } from 'vitest'
import {
  AUTH_COOKIE,
  authRequired,
  isValidSession,
  sessionCookieValue,
  timingSafeEqual,
  tokenMatches,
} from '@/lib/airshot/core/auth'

const ORIGINAL = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('core/auth (sesión de instancia)', () => {
  it('está en modo abierto sin AIRSHOT_API_TOKEN', async () => {
    delete process.env.AIRSHOT_API_TOKEN
    expect(authRequired()).toBe(false)
    expect(await tokenMatches('lo que sea')).toBe(false)
  })

  it('exige token cuando AIRSHOT_API_TOKEN está definido', async () => {
    process.env.AIRSHOT_API_TOKEN = 'super-secret'
    expect(authRequired()).toBe(true)
    expect(await tokenMatches('super-secret')).toBe(true)
    expect(await tokenMatches('super-secreT')).toBe(false)
    expect(await tokenMatches('super')).toBe(false)
  })

  it('la cookie es HMAC determinista y no contiene el token en claro', async () => {
    process.env.AIRSHOT_API_TOKEN = 'super-secret'
    const a = await sessionCookieValue('super-secret')
    const b = await sessionCookieValue('super-secret')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toContain('super-secret')
    expect(await sessionCookieValue('otro-token')).not.toBe(a)
  })

  it('isValidSession solo acepta el HMAC del token vigente', async () => {
    process.env.AIRSHOT_API_TOKEN = 'super-secret'
    const good = await sessionCookieValue('super-secret')
    expect(await isValidSession(good, 'super-secret')).toBe(true)
    expect(await isValidSession(undefined, 'super-secret')).toBe(false)
    expect(await isValidSession('', 'super-secret')).toBe(false)
    expect(await isValidSession(good, 'rotated-token')).toBe(false)
  })

  it('timingSafeEqual compara contenido y longitud', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
    expect(timingSafeEqual('', '')).toBe(true)
  })

  it('expone el nombre de cookie estable', () => {
    expect(AUTH_COOKIE).toBe('airshot_auth')
  })
})
