// AirShot — infrastructure/providers/factory.ts (ADR-007: Strategy + Factory)
// Resolución del proveedor por operación (§3.1.4):
//   providerOverride del request > campo del proyecto > default de config.yaml
// El proveedor resuelto sin registro o (auth=api_key) sin ProviderConfig con key
// ⇒ 409 PROVIDER_NOT_CONFIGURED (fail-fast ANTES de llamar al proveedor).
// auth=env/none (zai, ffmpeg-kenburns, voicestudio, earshot) no exige key —
// decisión documentada en ADR-016 para el runtime sandbox.

import type { ProviderType } from '@/lib/airshot/config/loader'
import { airshotConfig, airshotRegistry, getRegistryEntry } from '@/lib/airshot/config/loader'
import { db } from '@/lib/db'
import { decryptSecret } from '@/lib/airshot/core/crypto'
import { AppError } from '@/lib/airshot/core/errors'
import { makeSemaphore } from '@/lib/airshot/infrastructure/providers/types'
import type { AudioQAProvider, ImageProvider, LLMProvider, TTSProvider, VideoProvider } from '@/lib/airshot/infrastructure/providers/types'
import { ZaiImageProvider, ZaiLLMProvider, ZaiTTSProvider } from '@/lib/airshot/infrastructure/providers/zai-adapters'
import { FfmpegKenBurnsVideoProvider } from '@/lib/airshot/infrastructure/providers/ffmpeg-video'
import {
  ElevenLabsTTSProvider,
  ExternalVideoProvider,
  OpenAICompatImageProvider,
  OpenAICompatLLMProvider,
  OpenAICompatTTSProvider,
} from '@/lib/airshot/infrastructure/providers/external'
import { EarshotAudioQAProvider } from '@/lib/airshot/infrastructure/providers/earshot'

type Creds = { name: string; entry: ReturnType<typeof getRegistryEntry> & object; apiKey: string | null; baseUrl: string | null; defaultParams: Record<string, unknown> }

const semaphores = new Map<string, ReturnType<typeof makeSemaphore>>()

function semaphoreFor(name: string): ReturnType<typeof makeSemaphore> {
  let sem = semaphores.get(name)
  if (sem === undefined) {
    const entry = getRegistryEntryAny(name)
    sem = makeSemaphore(entry?.max_concurrent ?? 1, name)
    semaphores.set(name, sem)
  }
  return sem
}

function getRegistryEntryAny(name: string) {
  for (const type of ['video', 'tts', 'llm', 'image', 'audio_qa'] as const) {
    const e = getRegistryEntry(type, name)
    if (e !== undefined) return e
  }
  return undefined
}

function defaultOf(type: ProviderType): string {
  switch (type) {
    case 'video': return airshotConfig.providers.default_video
    case 'tts': return airshotConfig.providers.default_tts
    case 'llm': return airshotConfig.providers.default_llm
    case 'image': return airshotConfig.providers.default_image
    case 'audio_qa': return 'earshot'
  }
}

/** Nombre efectivo + entrada del registro (409 si no registrado). */
export function resolveProviderName(type: ProviderType, override?: string | null, projectValue?: string | null): { name: string; entry: NonNullable<ReturnType<typeof getRegistryEntry>> } {
  const name = override ?? projectValue ?? defaultOf(type)
  const entry = getRegistryEntry(type, name)
  if (entry === undefined) {
    const registered = Object.keys(getRegistryAll(type)).sort().join(', ')
    throw new AppError('PROVIDER_NOT_CONFIGURED', `proveedor "${name}" no registrado en providers.yaml [${type}]; registrados: ${registered}`, {
      provider: name,
      hints: [`Añádelo a config/providers.yaml (${registered}) o elige uno registrado.`],
    })
  }
  return { name, entry }
}

function getRegistryAll(type: ProviderType): Record<string, unknown> {
  return airshotRegistry[type] as Record<string, unknown>
}

/** Credenciales resueltas desde ProviderConfig (ADR-012: cifradas) + registro. */
async function resolveCredentials(type: ProviderType, name: string, entry: NonNullable<ReturnType<typeof getRegistryEntry>>): Promise<Creds> {
  const row = await db.providerConfig.findUnique({
    where: { providerType_providerName: { providerType: type, providerName: name } },
  })
  // baseUrl: null en ProviderConfig ⇒ hereda el default del registro (documentado §2.3)
  const baseUrl = row ? (row.baseUrl ?? entry.base_url) : entry.base_url
  const defaultParams = row !== null ? parseJsonLoose(row.defaultParams) : {}
  let apiKey: string | null = null
  if (entry.auth === 'api_key') {
    const decrypted = decryptSecret(row?.apiKeyEncrypted)
    if (row === null || decrypted === null || decrypted.length === 0) {
      throw new AppError('PROVIDER_NOT_CONFIGURED', `proveedor "${name}" [${type}] exige API key y no hay ProviderConfig activo con key`, {
        provider: name,
        hints: ['Configura la key en Configuración → Proveedores (POST /api/v1/provider-configs) y pruébala con POST …/test.'],
      })
    }
    apiKey = decrypted
  }
  return { name, entry, apiKey, baseUrl, defaultParams }
}

function parseJsonLoose(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------- fábricas por tipo

export async function getVideoProvider(override?: string | null, projectValue?: string | null): Promise<{ provider: VideoProvider; name: string }> {
  // §2.3/§3.1.4: override > campo del proyecto; sin ninguno ⇒ 409 PROVIDER_NOT_CONFIGURED
  // (el video NO tiene default silencioso de config; providers.default_video es solo
  // sugerencia de UI vía GET /config — documentado en ADR-016)
  const chosen = override ?? projectValue ?? null
  if (chosen === null) {
    const registered = Object.keys(airshotRegistry.video).sort().join(', ')
    throw new AppError('PROVIDER_NOT_CONFIGURED', `videoProvider sin elegir en el proyecto ni override; registrados: ${registered}`, {
      hints: ['Elige un proveedor de vídeo al crear/editar el proyecto o pasa providerOverride.'],
    })
  }
  const { name, entry } = resolveProviderName('video', chosen, null)
  const creds = await resolveCredentials('video', name, entry)
  const provider: VideoProvider = entry.adapter === 'ffmpeg-kenburns'
    ? new FfmpegKenBurnsVideoProvider(name, entry, creds.defaultParams)
    : new ExternalVideoProvider(name, entry, creds.apiKey ?? '', creds.baseUrl ?? entry.base_url ?? '', creds.defaultParams)
  return { provider, name }
}

export async function getTTSProvider(override?: string | null, projectValue?: string | null): Promise<{ provider: TTSProvider; name: string }> {
  const { name, entry } = resolveProviderName('tts', override, projectValue)
  const creds = await resolveCredentials('tts', name, entry)
  let provider: TTSProvider
  switch (entry.adapter) {
    case 'zai-tts': provider = new ZaiTTSProvider(name, entry, creds.defaultParams); break
    case 'openai-compat-tts': provider = new OpenAICompatTTSProvider(name, entry, creds.apiKey, creds.baseUrl ?? entry.base_url ?? '', creds.defaultParams); break
    case 'elevenlabs-tts': provider = new ElevenLabsTTSProvider(name, entry, creds.apiKey ?? '', creds.baseUrl ?? entry.base_url ?? '', creds.defaultParams); break
    default: throw new AppError('PROVIDER_NOT_CONFIGURED', `adaptador TTS desconocido "${entry.adapter}"`, { provider: name })
  }
  return { provider, name }
}

export async function getLLMProvider(override?: string | null): Promise<{ provider: LLMProvider; name: string }> {
  const { name, entry } = resolveProviderName('llm', override, null)
  const creds = await resolveCredentials('llm', name, entry)
  const provider: LLMProvider = entry.adapter === 'zai-llm'
    ? new ZaiLLMProvider(name, entry, creds.defaultParams)
    : new OpenAICompatLLMProvider(name, entry, creds.apiKey ?? '', creds.baseUrl ?? entry.base_url ?? '', creds.defaultParams)
  return { provider, name }
}

export async function getImageProvider(override?: string | null): Promise<{ provider: ImageProvider; name: string }> {
  const { name, entry } = resolveProviderName('image', override, null)
  const creds = await resolveCredentials('image', name, entry)
  const provider: ImageProvider = entry.adapter === 'zai-image'
    ? new ZaiImageProvider(name, entry, creds.defaultParams)
    : new OpenAICompatImageProvider(name, entry, creds.apiKey ?? '', creds.baseUrl ?? entry.base_url ?? '', creds.defaultParams)
  return { provider, name }
}

export function getAudioQAProvider(): { provider: AudioQAProvider; name: string } {
  return { provider: new EarshotAudioQAProvider('earshot', {}), name: 'earshot' }
}

/** Ejecuta dentro del semáforo de concurrencia del proveedor (§3.1.4). */
export async function withProviderConcurrency<T>(providerName: string, fn: () => Promise<T>): Promise<T> {
  return semaphoreFor(providerName).run(fn)
}
