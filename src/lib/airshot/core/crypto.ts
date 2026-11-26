// AirShot — core/crypto.ts
// Cifrado de API keys de ProviderConfig (ADR-012; INV-14 enmascaramiento).
// Adaptación ADR-016: Fernet (Python) → AES-256-GCM (Node crypto), equivalente
// en confidencialidad/integridad. Clave: env AIRSHOT_SECRET_KEY (base64 32 bytes).
// Si el entorno no la define (sandbox local single-user), se deriva determinista
// con scrypt y se registra un aviso — nunca se inventa un secreto gestionado.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { logger } from '@/lib/airshot/core/logger'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
let warned = false

function getKey(): Buffer {
  const env = process.env.AIRSHOT_SECRET_KEY
  if (env && env.length > 0) {
    const raw = Buffer.from(env, 'base64')
    if (raw.length === 32) return raw
    // aceptamos también frases: derivamos
    return scryptSync(env, 'airshot-secret-key-v1', 32)
  }
  if (process.env.NODE_ENV === 'production') {
    // Fail-fast: una clave fija haría descifrables las API keys por cualquiera
    // con acceso al código; en producción el env es obligatorio.
    throw new Error('AIRSHOT_SECRET_KEY no definida: es obligatoria en producción (base64 de 32 bytes o frase)')
  }
  if (!warned) {
    warned = true
    logger.warn('crypto.fallback_key', { detail: 'AIRSHOT_SECRET_KEY no definida: usando clave local derivada (define el env para portabilidad)' })
  }
  return scryptSync('airshot-local-default', 'airshot-local-salt-v1', 32)
}

/** Cifra y devuelve 'v1:' + base64(iv|tag|ciphertext). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, getKey(), iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${Buffer.concat([iv, tag, ct]).toString('base64')}`
}

/** Descifra; null si el payload no es descifrable (se trata como «key ausente»). */
export function decryptSecret(payload: string | null | undefined): string | null {
  if (payload === null || payload === undefined || payload.length === 0) return null
  try {
    const b64 = payload.startsWith('v1:') ? payload.slice(3) : payload
    const raw = Buffer.from(b64, 'base64')
    const iv = raw.subarray(0, IV_LEN)
    const tag = raw.subarray(IV_LEN, IV_LEN + 16)
    const ct = raw.subarray(IV_LEN + 16)
    const decipher = createDecipheriv(ALGO, getKey(), iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
    return plain
  } catch {
    return null
  }
}

/** INV-14: enmascara dejando solo los últimos N caracteres visibles. */
export function maskSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain.length === 0) return null
  const visible = Math.min(airshotConfig.security.api_key_mask_visible_chars, plain.length)
  const tail = plain.slice(-visible)
  return `••••${tail}`
}
