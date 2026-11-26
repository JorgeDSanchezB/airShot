// Integración: contratos wire de los adaptadores externos contra un servidor
// HTTP local real (node:http). Verifica forma de las peticiones (método, ruta,
// cabeceras, body), el flujo submit→poll→download y la clasificación de errores.
// Honestidad: NO valida las APIs reales de cada proveedor (eso exige credenciales
// — supuesto A-02); sí fija el contrato que el adaptador implementa.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

vi.mock('@/lib/airshot/infrastructure/ffmpeg', async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  return {
    // directorio propio por llamada: no colisiona con otros tests que usan tests/tmp
    makeTempDir: () => ({ dir: mkdtempSync(join(tmpdir(), 'airshot-contract-')), cleanup: () => undefined }),
    probeDuration: async () => 1.5,
  }
})

import { AppError } from '@/lib/airshot/core/errors'
import { runWithTraceContext } from '@/lib/airshot/core/context'
import type { ProviderEntry } from '@/lib/airshot/config/loader'
import {
  ExternalVideoProvider,
  OpenAICompatImageProvider,
  OpenAICompatLLMProvider,
  OpenAICompatTTSProvider,
} from '@/lib/airshot/infrastructure/providers/external'

type Captured = { method: string; path: string; headers: IncomingMessage['headers']; body: string }
type Behaviour = {
  ttsUnauthorized: boolean
  llmStatus: number
  llmContent: string
  imageMode: 'b64' | 'url'
}

let server: Server
let base = ''
let calls: Captured[] = []
let behaviour: Behaviour

const WAV = Buffer.from([82, 73, 70, 70, 0, 0, 0, 0])
const MP4 = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112])
const PNG = Buffer.from([137, 80, 78, 71])

function entry(over: Partial<ProviderEntry> = {}): ProviderEntry {
  return {
    adapter: 'external',
    auth: 'api_key',
    base_url: null,
    timeout_seconds: 10,
    max_retries: 0,
    backoff_base_seconds: 0.01,
    max_concurrent: 1,
    ...over,
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const body = await readBody(req)
    calls.push({ method: req.method ?? 'GET', path: pathname, headers: req.headers, body })

    if (pathname === '/v1/audio/speech') {
      if (behaviour.ttsUnauthorized) {
        json(res, 401, { error: 'invalid key' })
        return
      }
      res.writeHead(200, { 'content-type': 'audio/wav' })
      res.end(WAV)
      return
    }
    if (pathname === '/v1/chat/completions') {
      if (behaviour.llmStatus !== 200) {
        res.writeHead(behaviour.llmStatus, { 'content-type': 'text/plain' })
        res.end('upstream boom')
        return
      }
      json(res, 200, { choices: [{ message: { content: behaviour.llmContent } }] })
      return
    }
    if (pathname === '/v1/images/generations') {
      json(res, 200, {
        data: [behaviour.imageMode === 'b64' ? { b64_json: PNG.toString('base64') } : { url: `${base}/asset.png` }],
      })
      return
    }
    if (pathname === '/asset.png') {
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(PNG)
      return
    }
    if (pathname === '/v1beta/models/veo-3.0-preview:predictLongRunning') {
      json(res, 200, { name: 'models/veo/operations/op-veo-1' })
      return
    }
    if (pathname === '/v1beta/operations/op-veo-1') {
      json(res, 200, {
        done: true,
        response: { generateVideoResponse: { generatedSamples: [{ video: { uri: `${base}/asset.mp4` } }] } },
      })
      return
    }
    if (pathname === '/asset.mp4') {
      res.writeHead(200, { 'content-type': 'video/mp4' })
      res.end(MP4)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(() => {
  calls = []
  behaviour = { ttsUnauthorized: false, llmStatus: 200, llmContent: '{"ok":true}', imageMode: 'b64' }
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('OpenAICompatTTSProvider (contrato wire)', () => {
  it('POST /audio/speech con JSON, bearer y respuesta WAV → duración sondeada', async () => {
    const provider = new OpenAICompatTTSProvider('voicestudio', entry(), 'sk-test', `${base}/v1`, { model: 'tts-1' })
    const result = await provider.synthesize({ text: 'Hola mundo', voiceId: null })

    expect(result.audioBytes).toEqual(WAV)
    expect(result.durationSeconds).toBe(1.5)
    expect(result.effectiveVoiceId).toBe('alloy')
    const call = calls[0]
    expect(call.method).toBe('POST')
    expect(call.path).toBe('/v1/audio/speech')
    expect(call.headers.authorization).toBe('Bearer sk-test')
    const body = JSON.parse(call.body) as { model: string; input: string; voice: string; response_format: string }
    expect(body).toMatchObject({ model: 'tts-1', input: 'Hola mundo', voice: 'alloy', response_format: 'wav' })
  })

  it('401 → PROVIDER_AUTH (no retryable)', async () => {
    behaviour.ttsUnauthorized = true
    const provider = new OpenAICompatTTSProvider('voicestudio', entry(), 'sk-mala', `${base}/v1`, {})
    const err = await provider.synthesize({ text: 'x', voiceId: null }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).problem.code).toBe('PROVIDER_AUTH')
    expect((err as AppError).problem.retryable).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('propaga traceparent W3C cuando hay contexto de traza activo', async () => {
    const provider = new OpenAICompatTTSProvider('voicestudio', entry(), null, `${base}/v1`, {})
    await runWithTraceContext({ traceId: 'abc123' }, () => provider.synthesize({ text: 'x', voiceId: 'nova' }))
    expect(calls[0].headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
    expect(String(calls[0].headers.traceparent).slice(3, 35)).toBe('abc123'.padStart(32, '0'))
  })
})

describe('OpenAICompatLLMProvider (contrato wire)', () => {
  it('POST /chat/completions con bearer, temperature de entry y JSON validado', async () => {
    const provider = new OpenAICompatLLMProvider('openai_compat', entry({ default_temperature: 0.3 }), 'sk-llm', `${base}/v1`, { model: 'gpt-test' })
    const parsed = await provider.completeStructured({
      systemPromptEn: 'sistema',
      userPayload: 'payload',
      validate: (value) => (value as { ok?: boolean }).ok === true,
    })
    expect(parsed).toEqual({ ok: true })
    const call = calls[0]
    expect(call.path).toBe('/v1/chat/completions')
    expect(call.headers.authorization).toBe('Bearer sk-llm')
    const body = JSON.parse(call.body) as { model: string; temperature: number; messages: Array<{ role: string }> }
    expect(body.model).toBe('gpt-test')
    expect(body.temperature).toBe(0.3)
    expect(body.messages.map((m) => m.role)).toEqual(['system', 'user'])
  })

  it('salida que no cumple el validador → LLM_INVALID_OUTPUT', async () => {
    behaviour.llmContent = 'no es json'
    const provider = new OpenAICompatLLMProvider('openai_compat', entry(), 'sk-llm', `${base}/v1`, {})
    const err = await provider.completeStructured({ systemPromptEn: 's', userPayload: 'p', validate: () => true }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).problem.code).toBe('LLM_INVALID_OUTPUT')
  })

  it('5xx se reintenta max_retries veces y termina en PROVIDER_UNAVAILABLE', async () => {
    behaviour.llmStatus = 503
    const provider = new OpenAICompatLLMProvider('openai_compat', entry({ max_retries: 2 }), 'sk-llm', `${base}/v1`, {})
    const err = await provider.completeStructured({ systemPromptEn: 's', userPayload: 'p', validate: () => true }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).problem.code).toBe('PROVIDER_UNAVAILABLE')
    expect(calls).toHaveLength(3)
  })
})

describe('OpenAICompatImageProvider (contrato wire)', () => {
  it('b64_json se decodifica sin descarga extra', async () => {
    const provider = new OpenAICompatImageProvider('openai_compat', entry(), 'sk-img', `${base}/v1`, { size: '1024x1024' })
    const result = await provider.generate({ promptEn: 'un faro', styleFragmentEn: 'cinematic' })
    expect(result.imageBytes).toEqual(PNG)
    expect(calls).toHaveLength(1)
    const body = JSON.parse(calls[0].body) as { prompt: string; size: string; n: number }
    expect(body).toMatchObject({ prompt: 'un faro, cinematic', size: '1024x1024', n: 1 })
  })

  it('url → se descarga binaria y se devuelven los bytes', async () => {
    behaviour.imageMode = 'url'
    const provider = new OpenAICompatImageProvider('openai_compat', entry(), 'sk-img', `${base}/v1`, {})
    const result = await provider.generate({ promptEn: 'x' })
    expect(result.imageBytes).toEqual(PNG)
    expect(calls.map((c) => c.path)).toEqual(['/v1/images/generations', '/asset.png'])
  })
})

describe('ExternalVideoProvider · veo (submit → poll → download)', () => {
  it('key en x-goog-api-key (nunca query), operation id y asset descargado', async () => {
    const provider = new ExternalVideoProvider('veo', entry({ supported_durations: [8], reference_image_limit: 3 }), 'goog-key', `${base}/v1beta`, {})
    const result = await provider.generate({
      sceneId: 'escena-1',
      promptEn: 'a lighthouse at dusk',
      durationSeconds: 8,
      imageAbsPath: null,
      referenceImageAbsPaths: [],
      resolution: '720p',
    })
    expect(result.clipBytes).toEqual(MP4)
    expect(result.providerJobId).toBe('op-veo-1')
    expect(result.effectiveDurationSeconds).toBe(8)

    const submit = calls[0]
    expect(submit.method).toBe('POST')
    expect(submit.path).toBe('/v1beta/models/veo-3.0-preview:predictLongRunning')
    expect(submit.headers['x-goog-api-key']).toBe('goog-key')
    expect(submit.path).not.toContain('key=')
    const submitBody = JSON.parse(submit.body) as { instances: Array<{ prompt: string }>; parameters: { durationSeconds: number } }
    expect(submitBody.instances[0].prompt).toBe('a lighthouse at dusk')
    expect(submitBody.parameters.durationSeconds).toBe(8)

    expect(calls.map((c) => c.path)).toEqual([
      '/v1beta/models/veo-3.0-preview:predictLongRunning',
      '/v1beta/operations/op-veo-1',
      '/asset.mp4',
    ])
    expect(calls[1].headers['x-goog-api-key']).toBe('goog-key')
  })
})
