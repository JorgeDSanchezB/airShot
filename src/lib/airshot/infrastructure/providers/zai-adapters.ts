// AirShot — infrastructure/providers/zai-adapters.ts
// Adaptadores sobre z-ai-web-dev-sdk (backend únicamente — ADR-016):
//   ZaiLLMProvider     → completions estructuradas (storyboard UC-02)
//   ZaiImageProvider   → imagen base de escena / imagen de referencia
//   ZaiTTSProvider     → narración (chunking ≤ max_text_chars, concat FFmpeg)
// Errores clasificados según §3.1.1: timeout → PROVIDER_TIMEOUT; 429 → RATE;
// otro fallo de red → PROVIDER_UNAVAILABLE; JSON inválido agotados reintentos
// → LLM_INVALID_OUTPUT (502).

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ZAI from 'z-ai-web-dev-sdk'
import type { ProviderEntry } from '@/lib/airshot/config/loader'
import { AppError, TransientProviderError } from '@/lib/airshot/core/errors'
import { extractJsonLoose } from '@/lib/airshot/core/json'
import { makeTempDir, probeDuration, runFfmpeg } from '@/lib/airshot/infrastructure/ffmpeg'
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageProvider,
  LLMProvider,
  LLMStructuredRequest,
  TTSProvider,
  TTSSynthesisRequest,
  TTSSynthesisResult,
  VoiceInfo,
  VoicePage,
} from '@/lib/airshot/infrastructure/providers/types'

type ZAIClient = Awaited<ReturnType<typeof ZAI.create>>

let zaiSingleton: Promise<ZAIClient> | null = null

function getZai(): Promise<ZAIClient> {
  zaiSingleton ??= ZAI.create()
  return zaiSingleton
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function classifySdkError(err: unknown, provider: string): TransientProviderError {
  const msg = err instanceof Error ? err.message : String(err)
  if (/timeout|timed?\s?out|abort/i.test(msg)) return new TransientProviderError(msg, 'timeout', provider)
  if (/429|rate.?limit/i.test(msg)) return new TransientProviderError(msg, 'rate_limit', provider)
  return new TransientProviderError(msg, 'unavailable', provider, msg)
}

/** Reintentos con backoff exponencial solo para errores transitorios (§3.1.1). */
async function runWithBackoff<T>(entry: ProviderEntry, provider: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= entry.max_retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!(err instanceof TransientProviderError)) throw err
      lastErr = err
      if (attempt < entry.max_retries) {
        await sleep(entry.backoff_base_seconds * 1000 * 2 ** attempt)
      }
    }
  }
  const transient = lastErr instanceof TransientProviderError
    ? lastErr
    : new TransientProviderError(String(lastErr), 'unavailable', provider)
  throw transient.toAppError()
}

// ---------------------------------------------------------------- LLM

export class ZaiLLMProvider implements LLMProvider {
  readonly name: string
  constructor(
    name: string,
    private readonly entry: ProviderEntry,
    private readonly _defaultParams: Record<string, unknown>,
  ) {
    this.name = name
  }

  async completeStructured(req: LLMStructuredRequest): Promise<unknown> {
    const temperature = req.temperature ?? this.entry.default_temperature
    let lastParseErr: unknown = null
    for (let attempt = 0; attempt <= this.entry.max_retries; attempt++) {
      try {
        const zai = await getZai()
        const completion = await zai.chat.completions.create({
          messages: [
            { role: 'assistant', content: req.systemPromptEn },
            { role: 'user', content: req.userPayload },
          ],
          thinking: { type: 'disabled' },
        })
        const content = completion.choices[0]?.message?.content ?? ''
        if (content.trim().length === 0) {
          throw new TransientProviderError('respuesta vacía del LLM', 'unavailable', this.name)
        }
        const parsed = extractJsonLoose(content)
        if (!req.validate(parsed)) {
          lastParseErr = new Error('la salida no supera la validación del esquema del storyboard')
          if (attempt < this.entry.max_retries) {
            await sleep(this.entry.backoff_base_seconds * 1000)
            continue
          }
          break
        }
        return parsed
      } catch (err) {
        if (err instanceof TransientProviderError) {
          if (attempt < this.entry.max_retries) {
            await sleep(this.entry.backoff_base_seconds * 1000 * 2 ** attempt)
            continue
          }
          throw err.toAppError()
        }
        lastParseErr = err
        if (attempt < this.entry.max_retries) {
          await sleep(this.entry.backoff_base_seconds * 1000)
          continue
        }
        break
      }
    }
    throw new AppError('LLM_INVALID_OUTPUT', `el LLM no produjo JSON válido tras ${this.entry.max_retries + 1} intentos: ${(lastParseErr as Error | null)?.message ?? 'sin detalle'}`, {
      provider: this.name,
      hints: ['Ajusta la historia o regenera el storyboard; el prompt del sistema ya exige JSON estricto.'],
    })
  }
}

// ---------------------------------------------------------------- Image

const ZAI_IMAGE_SIZES = ['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440'] as const
type ZaiImageSize = (typeof ZAI_IMAGE_SIZES)[number]

function resolveZaiImageSize(candidate: unknown, fallback: string | undefined): ZaiImageSize {
  const wanted = typeof candidate === 'string' ? candidate : (fallback ?? '1344x768')
  return (ZAI_IMAGE_SIZES as readonly string[]).includes(wanted) ? (wanted as ZaiImageSize) : '1344x768'
}

export class ZaiImageProvider implements ImageProvider {
  readonly name: string
  constructor(
    name: string,
    private readonly entry: ProviderEntry,
    private readonly defaultParams: Record<string, unknown>,
  ) {
    this.name = name
  }

  async generate(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const prompt = req.styleFragmentEn ? `${req.promptEn}, ${req.styleFragmentEn}` : req.promptEn
    const size = resolveZaiImageSize(this.defaultParams.size, this.entry.landscape_size)
    const doGenerate = (): Promise<ImageGenerationResult> =>
      getZai().then(async (zai) => {
        try {
          const response = await zai.images.generations.create({ prompt, size })
          const b64 = response.data?.[0]?.base64
          if (!b64) {
            throw new TransientProviderError('la respuesta de imagen no contiene base64', 'unavailable', this.name)
          }
          return { imageBytes: Buffer.from(b64, 'base64'), format: 'png' as const }
        } catch (err) {
          if (err instanceof TransientProviderError) throw err
          throw classifySdkError(err, this.name)
        }
      })
    return runWithBackoff(this.entry, this.name, doGenerate)
  }
}

// ---------------------------------------------------------------- TTS

const ZAI_VOICES: VoiceInfo[] = [
  { id: 'tongtong', name: 'Tongtong', language: 'zh-CN', description: 'Cálida y cercana' },
  { id: 'chuichui', name: 'Chuichui', language: 'zh-CN', description: 'Vivaz y alegre' },
  { id: 'xiaochen', name: 'Xiaochen', language: 'zh-CN', description: 'Seria y profesional' },
  { id: 'jam', name: 'Jam', language: 'en-GB', description: 'Caballero británico' },
  { id: 'kazi', name: 'Kazi', language: 'zh-CN', description: 'Clara y estándar' },
  { id: 'douji', name: 'Douji', language: 'zh-CN', description: 'Natural y fluida' },
  { id: 'luodo', name: 'Luodo', language: 'zh-CN', description: 'Expresiva y emotiva' },
].sort((a, b) => (a.id < b.id ? -1 : 1))

export class ZaiTTSProvider implements TTSProvider {
  readonly name: string
  constructor(
    name: string,
    private readonly entry: ProviderEntry,
    private readonly defaultParams: Record<string, unknown>,
  ) {
    this.name = name
  }

  async synthesize(req: TTSSynthesisRequest): Promise<TTSSynthesisResult> {
    const voice = req.voiceId ?? (this.defaultParams.voice as string | undefined) ?? this.entry.default_voice ?? 'tongtong'
    const maxChars = this.entry.max_text_chars ?? 1024
    const chunks = splitNarration(req.text, maxChars)
    const temp = makeTempDir('tts')
    try {
      const buffers: Buffer[] = []
      for (const chunk of chunks) {
        const synthOne = async (): Promise<Buffer> => {
          const zai = await getZai()
          try {
            const response = await zai.audio.tts.create({
              input: chunk,
              voice,
              speed: req.speed ?? 1.0,
              response_format: 'wav',
              stream: false,
            })
            const arrayBuffer = await response.arrayBuffer()
            return Buffer.from(new Uint8Array(arrayBuffer))
          } catch (err) {
            throw classifySdkError(err, this.name)
          }
        }
        buffers.push(await runWithBackoff(this.entry, this.name, synthOne))
      }
      let audioBytes = buffers[0]
      if (buffers.length > 1) {
        // concat de WAV uniformes vía ffmpeg (filter_complex concat)
        const args: string[] = []
        const parts: string[] = []
        buffers.forEach((b, i) => {
          const p = join(temp.dir, `part${i}.wav`)
          writeFileSync(p, b)
          args.push('-i', p)
          parts.push(`[${i}:a]`)
        })
        const filter = `${parts.join('')}concat=n=${buffers.length}:v=0:a=1[aout]`
        const out = join(temp.dir, 'joined.wav')
        await runFfmpeg([...args, '-filter_complex', filter, '-map', '[aout]', out], 'tts-concat')
        audioBytes = readFileSync(out)
      }
      const joinedPath = join(temp.dir, 'final.wav')
      writeFileSync(joinedPath, audioBytes)
      const durationSeconds = await probeDuration(joinedPath)
      return { audioBytes, durationSeconds, effectiveVoiceId: voice }
    } finally {
      temp.cleanup()
    }
  }

  async listVoices(cursor: string | null, limit: number): Promise<VoicePage> {
    // catálogo materializado, orden estable por id, cursor = base64url(id) (§3.2)
    let startIdx = 0
    if (cursor !== null && cursor.length > 0) {
      const afterId = Buffer.from(cursor, 'base64url').toString('utf8')
      startIdx = ZAI_VOICES.findIndex((v) => v.id === afterId) + 1
      if (startIdx <= 0) {
        throw new AppError('VALIDATION_ERROR', 'cursor de voces malformado', { field: 'cursor' })
      }
    }
    const items = ZAI_VOICES.slice(startIdx, startIdx + limit)
    const last = items[items.length - 1]
    const nextCursor = items.length === limit && last !== undefined && startIdx + limit < ZAI_VOICES.length
      ? Buffer.from(last.id, 'utf8').toString('base64url')
      : null
    return { items, nextCursor }
  }
}

/** Chunking por oraciones dentro del límite del proveedor. */
export function splitNarration(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= maxChars) return [clean]
  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean]
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if ((current + sentence).length <= maxChars) {
      current += sentence
    } else {
      if (current.trim().length > 0) chunks.push(current.trim())
      if (sentence.length > maxChars) {
        // oración mayor que el límite: corte por palabras
        let piece = ''
        for (const word of sentence.split(' ')) {
          if ((piece + ' ' + word).trim().length > maxChars) {
            if (piece.trim().length > 0) chunks.push(piece.trim())
            piece = word
          } else {
            piece = piece.length === 0 ? word : `${piece} ${word}`
          }
        }
        current = piece
      } else {
        current = sentence
      }
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim())
  return chunks.length === 0 ? [clean.slice(0, maxChars)] : chunks
}
