// AirShot — infrastructure/providers/local.ts
// Adaptadores de proveedores LOCALES (auth=none), sin nube:
//   comfyui  → imagen vía workflow JSON con placeholders {{prompt}}/{{width}}/…
//              submit /prompt → poll /history/{id} → download /view
//   piper-tts→ narración invocando el binario piper con el texto por stdin
// Errores clasificados como el resto (timeout/unavailable) y con hints accionables.

import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { ProviderEntry } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { makeTempDir, probeDuration } from '@/lib/airshot/infrastructure/ffmpeg'
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageProvider,
  TTSProvider,
  TTSSynthesisRequest,
  TTSSynthesisResult,
  VoiceInfo,
  VoicePage,
} from '@/lib/airshot/infrastructure/providers/types'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function hintFor(baseUrl: string | null): string {
  return `Arranca el servicio local${baseUrl !== null ? ` en ${baseUrl}` : ''} o corrige base_url en la ProviderConfig.`
}

async function localJson<T>(entry: ProviderEntry, url: string, init: RequestInit | undefined, provider: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), entry.timeout_seconds * 1000)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, headers: { accept: 'application/json', ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) } })
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300)
      throw new AppError('PROVIDER_UNAVAILABLE', `${provider}: HTTP ${res.status} — ${text}`, { provider, hints: [hintFor(entry.base_url)] })
    }
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof AppError) throw err
    const kind = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'unavailable'
    throw new AppError(kind === 'timeout' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE', `${provider}: ${err instanceof Error ? err.message : String(err)}`, {
      provider,
      hints: [hintFor(entry.base_url)],
    })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------- ComfyUI (imagen)

type ComfyHistory = Record<string, { outputs?: Record<string, { images?: Array<{ filename: string; subfolder: string; type: string }> }>; status?: { status_str?: string; messages?: unknown } }>

function buildWorkflow(template: unknown, values: Record<string, string | number>): unknown {
  let raw = JSON.stringify(template)
  for (const [key, value] of Object.entries(values)) {
    const token = `{{${key}}}`
    const replacement = typeof value === 'number' ? String(value) : JSON.stringify(value).slice(1, -1)
    raw = raw.split(token).join(replacement)
  }
  return JSON.parse(raw) as unknown
}

export class ComfyUIImageProvider implements ImageProvider {
  constructor(
    readonly name: string,
    private readonly entry: ProviderEntry,
    private readonly params: Record<string, unknown>,
  ) {}

  async generate(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    if (this.entry.base_url === null) {
      throw new AppError('PROVIDER_NOT_CONFIGURED', 'comfyui requiere base_url (p. ej. http://127.0.0.1:8188)', { provider: this.name })
    }
    const workflowTemplate = this.params.workflow
    if (workflowTemplate === undefined || typeof workflowTemplate !== 'object' || workflowTemplate === null) {
      throw new AppError('PROVIDER_NOT_CONFIGURED', 'comfyui exige defaultParams.workflow (API format exportado de ComfyUI)', {
        provider: this.name,
        hints: ['Guarda el workflow con "Save (API Format)" y pégalo en defaultParams.workflow de la ProviderConfig.'],
      })
    }
    const workflow = buildWorkflow(workflowTemplate, {
      prompt: req.promptEn,
      negative: typeof this.params.negative === 'string' ? this.params.negative : '',
      width: typeof this.params.width === 'number' ? this.params.width : 1280,
      height: typeof this.params.height === 'number' ? this.params.height : 720,
      seed: req.seed ?? (typeof this.params.seed === 'number' ? this.params.seed : Math.floor(Math.random() * 2 ** 32)),
    })
    const base = this.entry.base_url.replace(/\/+$/, '')
    const submitted = await localJson<{ prompt_id?: string; error?: unknown }>(
      this.entry,
      `${base}/prompt`,
      { method: 'POST', body: JSON.stringify({ prompt: workflow, client_id: `airshot-${Date.now()}` }) },
      this.name,
    )
    if (submitted.prompt_id === undefined) {
      throw new AppError('PROVIDER_UNAVAILABLE', `comfyui no devolvió prompt_id: ${JSON.stringify(submitted.error ?? submitted).slice(0, 200)}`, { provider: this.name })
    }
    const deadline = Date.now() + this.entry.timeout_seconds * 1000
    let image: { filename: string; subfolder: string; type: string } | null = null
    while (Date.now() < deadline && image === null) {
      const history = await localJson<ComfyHistory>(this.entry, `${base}/history/${submitted.prompt_id}`, undefined, this.name)
      const entry = history[submitted.prompt_id]
      if (entry?.status?.status_str === 'error') {
        throw new AppError('PROVIDER_UNAVAILABLE', 'comfyui terminó el workflow con error', { provider: this.name })
      }
      const outputs = entry?.outputs ?? {}
      for (const node of Object.values(outputs)) {
        const found = node.images?.[0]
        if (found !== undefined) {
          image = found
          break
        }
      }
      if (image === null) await sleep(500)
    }
    if (image === null) {
      throw new AppError('PROVIDER_TIMEOUT', 'comfyui no produjo imagen dentro del timeout', { provider: this.name })
    }
    const view = new URL(`${base}/view`)
    view.searchParams.set('filename', image.filename)
    view.searchParams.set('subfolder', image.subfolder)
    view.searchParams.set('type', image.type || 'output')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.entry.timeout_seconds * 1000)
    try {
      const res = await fetch(view, { signal: controller.signal })
      if (!res.ok) throw new AppError('PROVIDER_UNAVAILABLE', `comfyui /view HTTP ${res.status}`, { provider: this.name })
      return { imageBytes: Buffer.from(await res.arrayBuffer()), format: 'png' }
    } finally {
      clearTimeout(timer)
    }
  }
}

// ---------------------------------------------------------------- Piper (TTS local)

function runPiper(command: string, args: string[], input: string, timeoutMs: number): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { shell: false })
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      rejectPromise(new AppError('PROVIDER_TIMEOUT', `piper excedió el timeout de ${Math.round(timeoutMs / 1000)}s`, { provider: 'piper' }))
    }, timeoutMs)
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectPromise(new AppError('PROVIDER_UNAVAILABLE', `piper no ejecutable: ${err.message}`, {
        provider: 'piper',
        hints: ['Instala piper (https://github.com/rhasspy/piper) o ajusta defaultParams.command.'],
      }))
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code === 0) resolvePromise()
      else rejectPromise(new AppError('PROVIDER_UNAVAILABLE', `piper falló (código ${code ?? -1}): ${stderr.trim().split('\n').slice(-3).join(' | ') || 'sin stderr'}`, { provider: 'piper' }))
    })
    child.stdin.write(input)
    child.stdin.end()
  })
}

export class PiperTTSProvider implements TTSProvider {
  constructor(
    readonly name: string,
    private readonly entry: ProviderEntry,
    private readonly params: Record<string, unknown>,
  ) {}

  private voices(): Record<string, string> {
    const raw = this.params.voices
    if (raw === undefined || typeof raw !== 'object' || raw === null) return {}
    const out: Record<string, string> = {}
    for (const [id, path] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof path === 'string' && path.length > 0) out[id] = path
    }
    return out
  }

  async synthesize(req: TTSSynthesisRequest): Promise<TTSSynthesisResult> {
    const command = typeof this.params.command === 'string' && this.params.command.length > 0 ? this.params.command : 'piper'
    const voices = this.voices()
    const model = (req.voiceId !== null && voices[req.voiceId] !== undefined)
      ? voices[req.voiceId]
      : typeof this.params.model_path === 'string' ? this.params.model_path : ''
    if (model.length === 0) {
      throw new AppError('PROVIDER_NOT_CONFIGURED', 'piper exige defaultParams.model_path o defaultParams.voices{id:ruta}', {
        provider: this.name,
        hints: ['Descarga un modelo .onnx de Piper y declara su ruta — o usa la voz "default".'],
      })
    }
    const extra = Array.isArray(this.params.extra_args)
      ? (this.params.extra_args as unknown[]).filter((v): v is string => typeof v === 'string')
      : []
    const temp = makeTempDir('piper')
    const outPath = join(temp.dir, 'narration.wav')
    try {
      await runPiper(command, ['--model', model, '--output_file', outPath, ...extra], req.text, this.entry.timeout_seconds * 1000)
      const audioBytes = readFileSync(outPath)
      const durationSeconds = await probeDuration(outPath)
      const effectiveVoiceId = req.voiceId ?? Object.keys(voices)[0] ?? 'default'
      return { audioBytes, durationSeconds, effectiveVoiceId }
    } finally {
      temp.cleanup()
    }
  }

  async listVoices(_cursor: string | null, _limit: number): Promise<VoicePage> {
    const names = Object.keys(this.voices())
    const items: VoiceInfo[] = names.length === 0
      ? [{ id: 'default', name: 'Piper (model_path)', language: null, description: null }]
      : names.map((id) => ({ id, name: id, language: null, description: null }))
    return { items, nextCursor: null }
  }
}
