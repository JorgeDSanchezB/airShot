import { beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

beforeAll(() => {
  // Clave fija de test: evita el fallback derivado y hace el cifrado reproducible.
  process.env.AIRSHOT_SECRET_KEY = Buffer.alloc(32, 7).toString('base64')
})

describe('crypto (ADR-012 / INV-14)', () => {
  it('roundtrip encryptSecret/decryptSecret', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/airshot/core/crypto')
    const plain = `sk-test-${randomUUID()}`
    const payload = encryptSecret(plain)
    expect(payload.startsWith('v1:')).toBe(true)
    expect(payload).not.toContain(plain)
    expect(decryptSecret(payload)).toBe(plain)
  })

  it('payload manipulado → null (se trata como key ausente, nunca crash)', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/airshot/core/crypto')
    const payload = encryptSecret('secreto')
    const tampered = `${payload.slice(0, -4)}AAAA`
    expect(decryptSecret(tampered)).toBeNull()
  })

  it('null/undefined/"" → null', async () => {
    const { decryptSecret } = await import('@/lib/airshot/core/crypto')
    expect(decryptSecret(null)).toBeNull()
    expect(decryptSecret(undefined)).toBeNull()
    expect(decryptSecret('')).toBeNull()
  })

  it('maskSecret deja visibles solo los últimos api_key_mask_visible_chars', async () => {
    const { maskSecret } = await import('@/lib/airshot/core/crypto')
    expect(maskSecret('1234567890')).toBe('••••7890')
    expect(maskSecret('ab')).toBe('••••ab')
    expect(maskSecret('')).toBeNull()
    expect(maskSecret(null)).toBeNull()
  })
})
