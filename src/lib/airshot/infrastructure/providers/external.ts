// AirShot — infrastructure/providers/external.ts
// Adaptadores HTTP para proveedores EXTERNOS del registro (Anexo B):
//   veo | kling | runway | luma (video), elevenlabs + voicestudio/openai_compat
//   (tts), openai_compat (llm | image).
//
// HONESTIDAD EPISTÉMICA (A-02): estos adaptadores implementan el flujo
// submit→poll→download contra las formas REST públicas documentadas de cada
// proveedor. En este sandbox NO hay credenciales para ninguno: sin ProviderConfig
// con API key el factory falla ANTES (409 PROVIDER_NOT_CONFIGURED, fail-fast,
// sin llegar a red). El cableado exacto de cada API queda como supuesto a
// verificar con credenciales reales (ADR-016 + agents.md). La clasificación de
// errores sí es real: 401/403 → PROVIDER_AUTH (sin reintentos), 429 → RATE,
// timeout → PROVIDER_TIMEOUT, 5xx/red → PROVIDER_UNAVAILABLE.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ProviderEntry } from '@/lib/airshot/config/loader'
import { AppError, ProviderAuthError, TransientProviderError } from '@/lib/airshot/core/errors'
import { extractJsonLoose } from '@/lib/airshot/core/json'
import { makeTempDir, probeDuration } from '@/lib/airshot/infrastructure/ffmpeg'
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageProvider,
  LLMProvider,
  LLMStructuredRequest,
  TTSProvider,
  TTSSynthesisRequest,
  TTSSynthesisResult,
  VideoGenerationRequest,
  VideoGenerationResult,
  VideoProvider,
  VoiceInfo,
  VoicePage,
} from '@/lib/airshot/infrastructure/providers/types'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

type HttpArgs = {
  method?: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  body?: unknown
  provider: string
  entry: ProviderEntry
}

/** POST/GET JSON con reintentos+backoff solo para transitorios (§3.1.1). */
async function httpJson<T>(args: HttpArgs): Promise<T> {
  for (let attempt = 0; attempt <= args.entry.max_retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), args.entry.timeout_seconds * 1000)
    try {
      const res = await fetch(args.url, {
        method: args.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(args.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...args.headers,
        },
        body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
        signal: controller.signal,
      })
      if (res.status === 401 || res.status === 403) {
        throw new ProviderAuthError(`${args.provider}: HTTP ${res.status} (API key inválida o sin permiso)`, args.provider)
      }
      if (res.status === 429) {
        throw new TransientProviderError(`${args.provider}: HTTP 429 rate limit`, 'rate_limit', args.provider)
      }
      if (res.status >= 500) {
        throw new TransientProviderError(`${args.provider}: HTTP ${res.status} upstream`, 'unavailable', args.provider)
      }
      if (!res.ok) {
        const text = (await res.text()).slice(0, 300)
        throw new AppError('PROVIDER_UNAVAILABLE', `${args.provider}: HTTP ${res.status} — ${text}`, { provider: args.provider })
      }
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof TransientProviderError) {
        if (attempt < args.entry.max_retries) {
          await sleep(args.entry.backoff_base_seconds * 1000 * 2 ** attempt)
          continue
        }
        throw err.toAppError()
      }
      if (err instanceof ProviderAuthError) throw err.toAppError()
      if (err instanceof Error && (err.name === 'AbortError' || /fetch failed|network/i.test(err.message))) {
        const kind = err.name === 'AbortError' ? 'timeout' : 'unavailable'
        if (attempt < args.entry.max_retries) {
          await sleep(args.entry.backoff_base_seconds * 1000 * 2 ** attempt)
          continue
        }
        throw new TransientProviderError(`${args.provider}: ${err.message}`, kind, args.provider).toAppError()
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }
  throw new AppError('INTERNAL_ERROR', `httpJson: camino inalcanzable (${args.provider})`)
}

/** Descarga binaria (asset final) con clasificación de errores. */
async function httpBinary(args: HttpArgs): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), args.entry.timeout_seconds * 1000)
  try {
    const res = await fetch(args.url, { method: 'GET', headers: args.headers, signal: controller.signal })
    if (res.status === 401 || res.status === 403) {
      throw new ProviderAuthError(`${args.provider}: HTTP ${res.status}`, args.provider).toAppError()
    }
    if (!res.ok) {
      throw new TransientProviderError(`${args.provider}: HTTP ${res.status} al descargar asset`, 'unavailable', args.provider).toAppError()
    }
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    if (err instanceof AppError) throw err
    if (err instanceof Error && (err.name === 'AbortError' || /fetch failed|network/i.test(err.message))) {
      const kind = err.name === 'AbortError' ? 'timeout' : 'unavailable'
      throw new TransientProviderError(`${args.provider}: ${err.message}`, kind, args.provider).toAppError()
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function dataUriImage(absPath: string): string {
  const b64 = readFileSync(absPath).toString('base64')
  return `data:image/png;base64,${b64}`
}

// ---------------------------------------------------------------- video externo

type VideoWireCtx = { baseUrl: string; key: string; req: VideoGenerationRequest; prompt: string; referenceImages: string[] }

type VideoWire = {
  submit: (ctx: VideoWireCtx) => { url: string; body: unknown }
  pollPath: (ctx: { baseUrl: string; key: string; opId: string }) => string
  extractOpId: (submitBody: unknown) => string
  extractAssetUrl: (pollBody: unknown) => string | null
  done: (pollBody: unknown) => boolean
}

const WIRES: Record<string, VideoWire> = {
  veo: {
    // M1 (ronda de corrección): consume referenceImageAbsPaths hasta reference_image_limit;
    // Veo admite hasta 3 imágenes (R-03): la base + referencias como parámetro adicional
    // (supuesto A-02: forma contra la API pública, a verificar con credenciales reales)
    submit: ({ baseUrl, key, req, prompt, referenceImages }) => ({
      url: `${baseUrl}/models/veo-3.0-preview:predictLongRunning?key=${key}`,
      body: {
        instances: [{
          prompt,
          ...(req.imageAbsPath !== null
            ? { image: { bytesBase64Encoded: readFileSync(req.imageAbsPath).toString('base64'), mimeType: 'image/png' } }
            : {}),
        }],
        parameters: {
          aspectRatio: '16:9',
          durationSeconds: req.durationSeconds,
          ...(req.seed !== undefined ? { seed: req.seed } : {}),
          ...(referenceImages.length > 0 ? { referenceImages } : {}),
        },
      },
    }),
    pollPath: ({ baseUrl, key, opId }) => `${baseUrl}/operations/${opId}?key=${key}`,
    extractOpId: (b) => String((b as { name?: string }).name ?? '').split('/').pop() ?? '',
    extractAssetUrl: (b) => {
      const r = b as { response?: { generateVideoResponse?: { generatedSamples?: Array<{ video?: { uri?: string } }> } } }
      return r.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ?? null
    },
    done: (b) => Boolean((b as { done?: boolean }).done),
  },
  kling: {
    submit: ({ baseUrl, req, prompt }) => ({
      url: `${baseUrl}/videos/image2video`,
      body: { prompt, image: req.imageAbsPath !== null ? dataUriImage(req.imageAbsPath) : undefined, duration: req.durationSeconds, mode: 'std' },
    }),
    pollPath: ({ baseUrl, opId }) => `${baseUrl}/videos/image2video/${opId}`,
    extractOpId: (b) => String((b as { data?: { task_id?: string } }).data?.task_id ?? ''),
    extractAssetUrl: (b) => ((b as { data?: { task_result?: { videos?: Array<{ url?: string }> } } }).data?.task_result?.videos?.[0]?.url ?? null),
    done: (b) => ['succeed', 'success', 'completed'].includes(String((b as { data?: { task_status?: string } }).data?.task_status ?? '')),
  },
  runway: {
    submit: ({ baseUrl, req, prompt }) => ({
      url: `${baseUrl}/image_to_video?model=gen4`,
      body: { promptText: prompt, promptImage: req.imageAbsPath !== null ? dataUriImage(req.imageAbsPath) : undefined, duration: req.durationSeconds, ratio: '1280:720' },
    }),
    pollPath: ({ baseUrl, opId }) => `${baseUrl}/tasks/${opId}`,
    extractOpId: (b) => String((b as { id?: string }).id ?? ''),
    extractAssetUrl: (b) => {
      const out = (b as { output?: string | Array<string> }).output
      if (out === undefined) return null
      return Array.isArray(out) ? (out[0] ?? null) : out
    },
    done: (b) => String((b as { status?: string }).status ?? '').toUpperCase() === 'SUCCEEDED',
  },
  luma: {
    submit: ({ baseUrl, req, prompt }) => ({
      url: `${baseUrl}/generations`,
      body: {
        prompt,
        ...(req.imageAbsPath !== null ? { keyframes: { frame0: { type: 'image', url: dataUriImage(req.imageAbsPath) } } } : {}),
        duration: `${req.durationSeconds}s`,
        aspect_ratio: '16:9',
      },
    }),
    pollPath: ({ baseUrl, opId }) => `${baseUrl}/generations/${opId}`,
    extractOpId: (b) => String((b as { id?: string }).id ?? ''),
    extractAssetUrl: (b) => ((b as { assets?: { video?: string | null } }).assets?.video ?? null),
    done: (b) => String((b as { state?: string }).state ?? '').toUpperCase() === 'COMPLETED',
  },
}

export class ExternalVideoProvider implements VideoProvider {
  readonly name: string
  constructor(
    name: string,
    private readonly entry: ProviderEntry,
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly _defaultParams: Record<string, unknown>,
  ) {
    this.name = name
  }

  capabilities(): { supportedDurations: number[]; referenceImageLimit: number } {
    return {
      supportedDurations: this.entry.supported_durations ?? [],
      referenceImageLimit: this.entry.reference_image_limit ?? 1,
    }
  }

  async generate(req: VideoGenerationRequest): Promise<VideoGenerationResult> {
    const wire = WIRES[this.name]
    if (wire === undefined) {
      throw new AppError('PROVIDER_NOT_CONFIGURED', `adaptador externo no disponible para "${this.name}"`, { provider: this.name })
    }
    const headers: Record<string, string> = this.name === 'runway'
      ? { authorization: `Bearer ${this.apiKey}`, 'x-runway-version': '2024-11-05' }
      : this.name === 'veo'
        ? {}
        : { authorization: `Bearer ${this.apiKey}` }
    // M1: referencias consumidas hasta el reference_image_limit del proveedor
    // (la imagen base ocupa 1 slot; kling/runway/luma con limit=1 solo reciben la base)
    const limit = this.capabilities().referenceImageLimit
    const referenceSlots = Math.max(0, limit - (req.imageAbsPath !== null ? 1 : 0))
    const referenceImages = req.referenceImageAbsPaths.slice(0, referenceSlots).map((p) => dataUriImage(p))
    const prompt = `${req.promptEn}${referenceImages.length > 0 ? ' (keep reference identity)' : ''}`
    const ctx: VideoWireCtx = { baseUrl: this.baseUrl, key: this.apiKey, req, prompt, referenceImages }
    const submit = wire.submit(ctx)
    const submitBody = await httpJson<unknown>({
      method: 'POST', url: submit.url, headers, body: submit.body, provider: this.name, entry: this.entry,
    })
    const opId = wire.extractOpId(submitBody)
    if (opId.length === 0) {
      throw new AppError('PROVIDER_UNAVAILABLE', `${this.name}: respuesta sin id de operación`, { provider: this.name })
    }
    const deadline = Date.now() + this.entry.timeout_seconds * 1000
    for (;;) {
      if (Date.now() > deadline) {
        throw new AppError('PROVIDER_TIMEOUT', `${this.name}: agotado el sondeo de la operación`, { provider: this.name })
      }
      const pollBody = await httpJson<unknown>({
        url: wire.pollPath({ baseUrl: this.baseUrl, key: this.apiKey, opId }), headers, provider: this.name, entry: this.entry,
      })
      if (wire.done(pollBody)) {
        const assetUrl = wire.extractAssetUrl(pollBody)
        if (assetUrl === null) {
          throw new AppError('PROVIDER_UNAVAILABLE', `${this.name}: job completado sin asset`, { provider: this.name })
        }
        const bytes = await httpBinary({ url: assetUrl, provider: this.name, entry: this.entry })
        return { clipBytes: bytes, effectiveDurationSeconds: req.durationSeconds, providerJobId: opId }
      }
      await sleep(3000)
    }
  }
}

// ---------------------------------------------------------------- TTS externo

export class OpenAICompatTTSProvider implements TTSProvider {
  readonly name: string
  constructor(
    name: string,
    private readonly entry: ProviderEntry,
    private readonly _apiKey: string | null,
    private readonly baseUrl: string,
    private readonly defaultParams: Record<string, unknown>,
  ) {
    this.name = name
  }

  async synthesize(req: TTSSynthesisRequest): Promise<TTSSynthesisResult> {
    const voice = req.voiceId ?? (this.defaultParams.voice as string | undefined) ?? this.entry.default_voice ?? 'alloy'
    const bytes = await httpBinary({
      method: 'POST',
      url: `${this.baseUrl}/audio/speech`,
      headers: this._apiKey !== null ? { authorization: `Bearer ${this._apiKey}` } : {},
      body: {
        model: (this.defaultParams.model as string | undefined) ?? 'default',
        input: req.text,
        voice,
        response_format: 'wav',
        speed: req.speed ?? 1.0,
      },
      provider: this.name,
      entry: this.entry,
    })
    const temp = makeTempDir('tts-ext')
    try {
      const p = join(temp.dir, 'out.wav')
      writeFileSync(p, bytes)
      const durationSeconds = await probeDuration(p)
      return { audioBytes: bytes, durationSeconds, effectiveVoiceId: voice }
    } finally {
      temp.cleanup()
    }
  }

  async listVoices(cursor: string | null, limit: number): Promise<VoicePage> {
    // catálogo típico OpenAI-compatible (supuesto A-05: verificar contra el endpoint real)
    const all: VoiceInfo[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map((id) => ({ id, name: id, language: null, description: null }))
    let startIdx = 0
    if (cursor !== null && cursor.length > 0) {
      const afterId = Buffer.from(cursor, 'base64url').toString('utf8')
      startIdx = all.findIndex((v) => v.id === afterId) + 1
      if (startIdx <= 0) throw new AppError('VALIDATION_ERROR', 'cursor de voces malformado', { field: 'cursor' })
    }
    const items = all.slice(startIdx, startIdx + limit)
    const last = items[items.length - 1]
    const nextCursor = items.length === limit && last !== undefined && startIdx + limit < all.length
      ? Buffer.from(last.id, 'utf8').toString('base64url')
      : null
    return { items, nextCursor }
  }
}

export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name: string
  constructor(
    name: string,
    private readonly entry: ProviderEntry,
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly defaultParams: Record<string, unknown>,
  ) {
    this.name = name
  }

  async synthesize(req: TTSSynthesisRequest): Promise<TTSSynthesisResult> {
    const voice = req.voiceId ?? (this.defaultParams.voice as string | undefined) ?? '21m00Tcm4TlvDq8ikWAM'
    const bytes = await httpBinary({
      method: 'POST',
      url: `${this.baseUrl}/text-to-speech/${voice}`,
      headers: { 'xi-api-key': this.apiKey },
      body: { text: req.text, model_id: (this.defaultParams.model as string | undefined) ?? 'eleven_multilingual_v2' },
      provider: this.name,
      entry: this.entry,
    })
    const temp = makeTempDir('tts-el')
    try {
      const p = join(temp.dir, 'out.mp3')
      writeFileSync(p, bytes)
      const durationSeconds = await probeDuration(p)
      return { audioBytes: bytes, durationSeconds, effectiveVoiceId: voice }
    } finally {
      temp.cleanup()
    }
  }

  async listVoices(_cursor: string | null, _limit: number): Promise<VoicePage> {
    // catálogo dinámico: exige API key activa (A-02); sin ella no se inventan voces
    throw new AppError('PROVIDER_UNAVAILABLE', 'listado de voces de ElevenLabs requiere API key activa', { provider: this.name })
  }
}

// ---------------------------------------------------------------- LLM / imagen OpenAI-compat

export class OpenAICompatLLMProvider implements LLMProvider {
  readonly name: string
  constructor(
    name: string,
    private readonly entry: ProviderEntry,
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly defaultParams: Record<string, unknown>,
  ) {
    this.name = name
  }

  async completeStructured(req: LLMStructuredRequest): Promise<unknown> {
    const body = await httpJson<{ choices?: Array<{ message?: { content?: string } }> }>({
      method: 'POST',
      url: `${this.baseUrl}/chat/completions`,
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: {
        model: (this.defaultParams.model as string | undefined) ?? 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `${req.systemPromptEn}\nRespond with a single valid JSON object and nothing else.` },
          { role: 'user', content: req.userPayload },
        ],
        temperature: req.temperature ?? this.entry.default_temperature,
      },
      provider: this.name,
      entry: this.entry,
    })
    const content = body.choices?.[0]?.message?.content ?? ''
    if (content.trim().length === 0) {
      throw new AppError('LLM_INVALID_OUTPUT', `${this.name}: contenido vacío`, { provider: this.name })
    }
    const parsed = extractJsonLoose(content)
    if (!req.validate(parsed)) {
      throw new AppError('LLM_INVALID_OUTPUT', `${this.name}: la salida no supera el esquema (los reintentos cubrieron solo fallos de red)`, { provider: this.name })
    }
    return parsed
  }
}

export class OpenAICompatImageProvider implements ImageProvider {
  readonly name: string
  constructor(
    name: string,
    private readonly entry: ProviderEntry,
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly defaultParams: Record<string, unknown>,
  ) {
    this.name = name
  }

  async generate(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const body = await httpJson<{ data?: Array<{ b64_json?: string; url?: string }> }>({
      method: 'POST',
      url: `${this.baseUrl}/images/generations`,
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: {
        model: (this.defaultParams.model as string | undefined) ?? 'gpt-image-1',
        prompt: req.styleFragmentEn ? `${req.promptEn}, ${req.styleFragmentEn}` : req.promptEn,
        size: (this.defaultParams.size as string | undefined) ?? '1536x1024',
        n: 1,
      },
      provider: this.name,
      entry: this.entry,
    })
    const first = body.data?.[0]
    if (first?.b64_json !== undefined) {
      return { imageBytes: Buffer.from(first.b64_json, 'base64'), format: 'png' }
    }
    if (first?.url !== undefined) {
      const bytes = await httpBinary({ url: first.url, provider: this.name, entry: this.entry })
      return { imageBytes: bytes, format: 'png' }
    }
    throw new AppError('PROVIDER_UNAVAILABLE', `${this.name}: respuesta sin imagen`, { provider: this.name })
  }
}
