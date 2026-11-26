// AirShot — infrastructure/providers/types.ts (§6.4 puertos, firmas adaptadas a TS)
// Ports & adapters: la variabilidad de proveedores vive aquí; el núcleo de
// aplicación solo ve estas interfaces (ADR-002/007).

import type { ProviderEntry } from '@/lib/airshot/config/loader'
import type { OutputResolution } from '@/lib/airshot/domain/enums'

export type ResolvedProvider = {
  name: string
  entry: ProviderEntry
  apiKey: string | null
  baseUrl: string | null
  defaultParams: Record<string, unknown>
}

export type VideoGenerationRequest = {
  sceneId: string
  promptEn: string
  durationSeconds: number // ya mapeada por DurationMapper
  imageAbsPath: string | null
  referenceImageAbsPaths: string[]
  resolution: OutputResolution
  seed?: number
}

export type VideoGenerationResult = {
  clipBytes: Buffer
  effectiveDurationSeconds: number
  providerJobId: string
}

export interface VideoProvider {
  readonly name: string
  generate(req: VideoGenerationRequest): Promise<VideoGenerationResult>
  capabilities(): { supportedDurations: number[]; referenceImageLimit: number }
}

export type TTSSynthesisRequest = {
  text: string
  voiceId: string | null
  speed?: number
  responseFormat?: 'wav'
}

export type TTSSynthesisResult = {
  audioBytes: Buffer
  durationSeconds: number | null
  effectiveVoiceId: string
}

export type VoiceInfo = { id: string; name: string; language: string | null; description: string | null }
export type VoicePage = { items: VoiceInfo[]; nextCursor: string | null }

export interface TTSProvider {
  readonly name: string
  synthesize(req: TTSSynthesisRequest): Promise<TTSSynthesisResult>
  listVoices(cursor: string | null, limit: number): Promise<VoicePage>
}

export type LLMStructuredRequest = {
  systemPromptEn: string
  userPayload: string
  validate: (value: unknown) => boolean
  temperature?: number
}

export interface LLMProvider {
  readonly name: string
  completeStructured(req: LLMStructuredRequest): Promise<unknown>
}

export type ImageGenerationRequest = {
  promptEn: string
  styleFragmentEn?: string | null
  aspectRatio?: '16:9'
  seed?: number
}

export type ImageGenerationResult = {
  imageBytes: Buffer
  format: 'png'
}

export interface ImageProvider {
  readonly name: string
  generate(req: ImageGenerationRequest): Promise<ImageGenerationResult>
}

export type AudioQAFeature = 'naturalness' | 'sync' | 'loudness' | 'artifacts'

export type AudioQAReport = {
  metrics: Array<{ assetKey: string; lufs: number | null; truePeakDb: number | null; durationSeconds: number | null }>
  findings: Array<{ severity: 'info' | 'warning' | 'error'; code: string; detail: string }>
  sfxKeys: string[]
}

export interface AudioQAProvider {
  readonly name: string
  analyze(req: { assetEntries: Array<{ assetKey: string; absPath: string; kind: 'narration' | 'music' | 'mix' }>; features: AudioQAFeature[]; generateSfx: boolean }): Promise<AudioQAReport>
}

export type ProviderSemaphore = { run<T>(fn: () => Promise<T>): Promise<T> }

export function makeSemaphore(max: number, label: string): ProviderSemaphore {
  let active = 0
  const queue: Array<() => void> = []
  async function acquire(): Promise<void> {
    if (active < max) {
      active++
      return
    }
    await new Promise<void>((res) => queue.push(res))
    active++
  }
  function release(): void {
    active--
    const next = queue.shift()
    if (next) next()
  }
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire()
      try {
        return await fn()
      } finally {
        release()
      }
    },
  }
}
