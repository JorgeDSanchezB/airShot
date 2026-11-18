// AirShot — services/provider-configs.ts (ADR-012: keys cifradas AES-256-GCM;
// INV-14: solo los últimos 4 caracteres visibles; upsert explícito 201/200)

import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { airshotConfig, airshotRegistry, getRegistryEntry } from '@/lib/airshot/config/loader'
import type { ProviderType } from '@/lib/airshot/config/loader'
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/airshot/core/crypto'
import { AppError } from '@/lib/airshot/core/errors'
import { toProviderConfigResponse } from '@/lib/airshot/domain/dto'
import type { ProviderConfigResponseDto } from '@/lib/airshot/domain/dto'
import { buildPage, decodeCursor, seekCreatedAt, type Order } from '@/lib/airshot/core/pagination'
import type { Page } from '@/lib/airshot/core/pagination'
import { ffmpegVersion } from '@/lib/airshot/infrastructure/ffmpeg'
import type { ProviderConfig } from '@prisma/client'
import type { z } from 'zod'
import type { PatchProviderConfigRequest, UpsertProviderConfigRequest } from '@/lib/airshot/domain/schemas'

// claves de defaultParams conocidas por tipo (validadas contra el registro —
// clave desconocida ⇒ 422, no se descarta en silencio; §2.3 ProviderConfig)
const KNOWN_DEFAULT_PARAMS: Record<ProviderType, string[]> = {
  llm: ['model', 'temperature'],
  image: ['model', 'size', 'quality'],
  tts: ['model', 'voice', 'speed'],
  video: ['model', 'mode', 'seed'],
  audio_qa: [],
}

function assertRegistered(type: ProviderType, name: string): void {
  if (getRegistryEntry(type, name) === undefined) {
    const registered = Object.keys(airshotRegistry[type]).sort().join(', ')
    throw new AppError('VALIDATION_ERROR', `providerName "${name}" no registrado en providers.yaml [${type}]; registrados: ${registered}`, {
      field: 'providerName',
      hints: [`Añade la entrada a config/providers.yaml o usa uno de: ${registered}`],
    })
  }
}

function assertDefaultParams(type: ProviderType, params: Record<string, unknown>): void {
  const known = KNOWN_DEFAULT_PARAMS[type]
  for (const key of Object.keys(params)) {
    if (!known.includes(key)) {
      throw new AppError('VALIDATION_ERROR', `defaultParams."${key}" desconocida para proveedores [${type}]; claves admitidas: ${known.join(', ') || '(ninguna)'}`, {
        field: `defaultParams.${key}`,
      })
    }
  }
}

export async function listProviderConfigs(query: {
  limit: number
  cursor: string | null
  order: Order
  providerType?: string
}): Promise<Page<ProviderConfigResponseDto>> {
  const where: Prisma.ProviderConfigWhereInput = {}
  if (query.providerType !== undefined) {
    const types: ProviderType[] = ['video', 'tts', 'llm', 'image', 'audio_qa']
    if (!types.includes(query.providerType as ProviderType)) {
      throw new AppError('VALIDATION_ERROR', `providerType="${query.providerType}" fuera de enum`, { field: 'providerType' })
    }
    where.providerType = query.providerType
  }
  if (query.cursor !== null) {
    const dec = decodeCursor(query.cursor)
    Object.assign(where, seekCreatedAt(query.order, String(dec.v), dec.i ?? ''))
  }
  const rows = await db.providerConfig.findMany({
    where,
    orderBy: [{ createdAt: query.order }, { id: query.order }],
    take: query.limit + 1,
  })
  const items = rows.map((row) => toProviderConfigResponse(row, maskSecret(decryptSecret(row.apiKeyEncrypted))))
  return buildPage(items, query.limit, (row) => ({ v: row.createdAt, i: row.id }))
}

export async function upsertProviderConfig(body: z.infer<typeof UpsertProviderConfigRequest>, created: boolean): Promise<ProviderConfigResponseDto> {
  assertRegistered(body.providerType, body.providerName)
  if (body.defaultParams !== undefined) assertDefaultParams(body.providerType, body.defaultParams)
  const apiKeyEncrypted = body.apiKey !== undefined && body.apiKey !== null && body.apiKey.length > 0 ? encryptSecret(body.apiKey) : null
  if (created) {
    const row = await db.providerConfig.create({
      data: {
        id: randomUUID(),
        providerType: body.providerType,
        providerName: body.providerName,
        apiKeyEncrypted,
        baseUrl: body.baseUrl ?? null,
        defaultParams: JSON.stringify(body.defaultParams ?? {}),
        isActive: body.isActive ?? true,
      },
    })
    return toProviderConfigResponse(row, maskSecret(body.apiKey ?? null))
  }
  const row = await db.providerConfig.update({
    where: { providerType_providerName: { providerType: body.providerType, providerName: body.providerName } },
    // upsert explícito: apiKey ausente en el update NO limpia la key previa (ausente≠nulo);
    // apiKey: null sí la limpia (semántica documentada)
    data: {
      ...(body.apiKey !== undefined ? { apiKeyEncrypted: body.apiKey === null ? null : encryptSecret(body.apiKey) } : {}),
      ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl } : {}),
      ...(body.defaultParams !== undefined ? { defaultParams: JSON.stringify(body.defaultParams) } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
    },
  })
  return toProviderConfigResponse(row, maskSecret(body.apiKey ?? decryptSecret(row.apiKeyEncrypted)))
}

export async function findProviderConfigRow(type: ProviderType, name: string): Promise<ProviderConfig | null> {
  return db.providerConfig.findUnique({ where: { providerType_providerName: { providerType: type, providerName: name } } })
}

export async function patchProviderConfig(id: string, body: z.infer<typeof PatchProviderConfigRequest>): Promise<ProviderConfigResponseDto> {
  const row = await db.providerConfig.findUnique({ where: { id } })
  if (row === null) throw new AppError('NOT_FOUND', `provider-config ${id} no encontrada`)
  assertRegistered(row.providerType as ProviderType, row.providerName)
  if (body.defaultParams !== undefined) assertDefaultParams(row.providerType as ProviderType, body.defaultParams)
  const data: Record<string, unknown> = {}
  if (body.apiKey !== undefined) data.apiKeyEncrypted = body.apiKey === null ? null : encryptSecret(body.apiKey)
  if (body.baseUrl !== undefined) data.baseUrl = body.baseUrl
  if (body.defaultParams !== undefined) data.defaultParams = JSON.stringify(body.defaultParams)
  if (body.isActive !== undefined) data.isActive = body.isActive
  const updated = Object.keys(data).length > 0 ? await db.providerConfig.update({ where: { id }, data: data as Prisma.ProviderConfigUpdateInput }) : row
  return toProviderConfigResponse(updated, maskSecret(decryptSecret(updated.apiKeyEncrypted)))
}

export async function deleteProviderConfig(id: string): Promise<void> {
  const row = await db.providerConfig.findUnique({ where: { id } })
  if (row === null) throw new AppError('NOT_FOUND', `provider-config ${id} no encontrada`)
  await db.providerConfig.delete({ where: { id } })
}

// ---------------------------------------------------------------- test

export type TestOutcome = { ok: boolean; latencyMs: number; error?: { code: string; detail: string } }

export async function testProviderConfig(id: string): Promise<TestOutcome> {
  const row = await db.providerConfig.findUnique({ where: { id } })
  if (row === null) throw new AppError('NOT_FOUND', `provider-config ${id} no encontrada`)
  const type = row.providerType as ProviderType
  const entry = getRegistryEntry(type, row.providerName)
  if (entry === undefined) {
    const outcome = { ok: false, latencyMs: 0, error: { code: 'PROVIDER_NOT_CONFIGURED', detail: 'proveedor no registrado en providers.yaml' } }
    await storeLastCheck(id, outcome)
    return outcome
  }
  const apiKey = decryptSecret(row.apiKeyEncrypted)
  const baseUrl = row.baseUrl ?? entry.base_url
  const started = Date.now()

  // fail-fast local: auth=api_key sin key ⇒ 409 (sin red)
  if (entry.auth === 'api_key' && (apiKey === null || apiKey.length === 0)) {
    throw new AppError('PROVIDER_NOT_CONFIGURED', `proveedor "${row.providerName}" [${type}] exige API key y no la tiene configurada`, {
      provider: row.providerName,
      hints: ['Guarda la key con PATCH o POST /api/v1/provider-configs y repite la prueba.'],
    })
  }

  let outcome: TestOutcome
  try {
    if (entry.adapter === 'zai-llm' || entry.adapter === 'zai-image' || entry.adapter === 'zai-tts') {
      const ZAI = (await import('z-ai-web-dev-sdk')).default
      await ZAI.create()
      outcome = { ok: true, latencyMs: Date.now() - started }
    } else if (entry.adapter === 'ffmpeg-kenburns' || entry.adapter === 'earshot') {
      const version = await ffmpegVersion()
      outcome = { ok: true, latencyMs: Date.now() - started, error: undefined }
      void version
    } else {
      // HTTP ligero de conectividad con la baseUrl efectiva
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.min(10_000, entry.timeout_seconds * 1000))
      try {
        const headers: Record<string, string> = {}
        if (apiKey !== null && apiKey.length > 0) {
          if (row.providerName === 'elevenlabs') headers['xi-api-key'] = apiKey
          else headers.authorization = `Bearer ${apiKey}`
        }
        const res = await fetch(`${baseUrl ?? ''}${row.providerName === 'elevenlabs' ? '/voices' : row.providerName === 'voicestudio' ? '/models' : ''}`, { headers, signal: controller.signal })
        if (res.status === 401 || res.status === 403) {
          outcome = { ok: false, latencyMs: Date.now() - started, error: { code: 'PROVIDER_AUTH', detail: `HTTP ${res.status}: API key inválida o sin permiso` } }
        } else {
          // cualquier respuesta HTTP del proveedor (incl. 404 de ruta de sonda) acredita
          // conectividad + autenticación básica; la validez del endpoint se valida al usar
          outcome = { ok: true, latencyMs: Date.now() - started }
        }
      } finally {
        clearTimeout(timer)
      }
    }
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    outcome = { ok: false, latencyMs: Date.now() - started, error: { code: 'PROVIDER_UNAVAILABLE', detail } }
  }
  await storeLastCheck(id, outcome)
  return outcome
}

async function storeLastCheck(id: string, outcome: TestOutcome): Promise<void> {
  const lastCheck = JSON.stringify({ ...outcome, checkedAt: new Date().toISOString() })
  await db.providerConfig.update({ where: { id }, data: { lastCheck } }).catch(() => undefined)
}

export const MASK_VISIBLE_CHARS = airshotConfig.security.api_key_mask_visible_chars
