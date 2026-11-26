// Regresión del bug P1: httpBinary ignoraba método/body y el adaptador TTS
// OpenAI-compatible acababa enviando un GET sin texto a /audio/speech.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'

vi.mock('@/lib/airshot/infrastructure/ffmpeg', () => ({
  makeTempDir: () => ({ dir: `${process.cwd()}/tests/tmp`, cleanup: () => undefined }),
  probeDuration: async () => 1.5,
}))

import { AppError } from '@/lib/airshot/core/errors'
import { OpenAICompatTTSProvider } from '@/lib/airshot/infrastructure/providers/external'

const entry = { timeout_seconds: 5, max_retries: 0, default_voice: null } as never

type Captured = { url: string; init: RequestInit }

let calls: Captured[] = []
let respond: (url: string, init: RequestInit) => Response

beforeAll(() => mkdirSync(`${process.cwd()}/tests/tmp`, { recursive: true }))

beforeEach(() => {
  calls = []
  respond = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init: unknown) => {
      const captured = { url: String(url), init: (init ?? {}) as RequestInit }
      calls.push(captured)
      return respond(captured.url, captured.init)
    }),
  )
})

afterAll(() => {
  vi.unstubAllGlobals()
  rmSync(`${process.cwd()}/tests/tmp`, { recursive: true, force: true })
})

describe('OpenAICompatTTSProvider (POST real y errores clasificados)', () => {
  it('hace POST JSON a /audio/speech con el texto y la key en Authorization', async () => {
    const provider = new OpenAICompatTTSProvider('voicestudio', entry, 'sk-test', 'http://localhost:3900/v1', {})
    const result = await provider.synthesize({ text: 'Hola mundo', voiceId: null, responseFormat: 'wav' })

    expect(result.audioBytes).toEqual(Buffer.from([1, 2, 3]))
    expect(result.durationSeconds).toBe(1.5)
    expect(result.effectiveVoiceId).toBe('alloy')

    const call = calls[0]
    expect(call.url).toBe('http://localhost:3900/v1/audio/speech')
    expect(call.init.method).toBe('POST')
    const headers = call.init.headers as Record<string, string>
    expect(headers['content-type']).toBe('application/json')
    expect(headers.authorization).toBe('Bearer sk-test')
    const body = JSON.parse(String(call.init.body)) as { input: string; response_format: string }
    expect(body.input).toBe('Hola mundo')
    expect(body.response_format).toBe('wav')
  })

  it('sin apiKey no envía Authorization y usa la voiceId explícita', async () => {
    const provider = new OpenAICompatTTSProvider('voicestudio', entry, null, 'http://localhost:3900/v1', {})
    await provider.synthesize({ text: 'x', voiceId: 'nova', responseFormat: 'wav' })
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
    const body = JSON.parse(String(calls[0].init.body)) as { voice: string }
    expect(body.voice).toBe('nova')
  })

  it('clasifica 5xx como PROVIDER_UNAVAILABLE (taxonomía §3.1.1)', async () => {
    respond = () => new Response('boom', { status: 503 })
    const provider = new OpenAICompatTTSProvider('voicestudio', entry, null, 'http://localhost:3900/v1', {})
    try {
      await provider.synthesize({ text: 'x', voiceId: null })
      throw new Error('se esperaba AppError')
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).problem.code).toBe('PROVIDER_UNAVAILABLE')
    }
  })
})
