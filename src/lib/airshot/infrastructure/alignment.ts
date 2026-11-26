// AirShot — infrastructure/alignment.ts
// Alineación forzada OPCIONAL de narración con whisper.cpp local
// (assembly.subtitles.align). Sin binario/modelo disponibles devuelve null y el
// ensamblaje usa tiempos estimados por duración de escena: el método aplicado se
// declara en el job (whisper | estimated), nunca se finge.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { logger } from '@/lib/airshot/core/logger'
import { makeTempDir, runProcess } from '@/lib/airshot/infrastructure/ffmpeg'

export type SubtitleCue = { startSeconds: number; endSeconds: number; text: string }

type RawSegment = {
  text?: string
  offsets?: { from?: number; to?: number }
  start?: number
  end?: number
}

let availability: { command: string; modelPath: string; ok: boolean } | null = null

export async function alignmentAvailable(): Promise<boolean> {
  const cfg = airshotConfig.assembly.subtitles.align
  if (!cfg.enabled || cfg.command.trim().length === 0 || cfg.model_path.trim().length === 0) return false
  if (availability !== null && availability.command === cfg.command && availability.modelPath === cfg.model_path) {
    return availability.ok
  }
  if (!existsSync(cfg.model_path)) {
    availability = { command: cfg.command, modelPath: cfg.model_path, ok: false }
    return false
  }
  let ok = true
  try {
    await runProcess(cfg.command, ['--help'], 5_000)
  } catch {
    ok = false
  }
  availability = { command: cfg.command, modelPath: cfg.model_path, ok }
  logger.info('assembly.align.availability', { command: cfg.command, model: cfg.model_path, available: ok })
  return ok
}

function splitCue(cue: SubtitleCue, maxChars: number): SubtitleCue[] {
  if (cue.text.length <= maxChars) return [cue]
  const words = cue.text.split(/\s+/).filter((w) => w.length > 0)
  const chunks: string[] = []
  let current = ''
  for (const word of words) {
    if (current.length === 0) current = word
    else if (`${current} ${word}`.length <= maxChars) current = `${current} ${word}`
    else {
      chunks.push(current)
      current = word
    }
  }
  if (current.length > 0) chunks.push(current)
  if (chunks.length <= 1) return [cue]
  const span = cue.endSeconds - cue.startSeconds
  const totalChars = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  let cursor = cue.startSeconds
  return chunks.map((chunk) => {
    const length = span * (chunk.length / totalChars)
    const item = { startSeconds: cursor, endSeconds: cursor + length, text: chunk }
    cursor += length
    return item
  })
}

/** Normaliza el JSON de whisper.cpp (`transcription[].offsets` en ms) o faster-whisper (segundos). */
export function cuesFromWhisperJson(raw: unknown, durationSeconds: number, maxChars: number): SubtitleCue[] {
  const obj = raw as { transcription?: RawSegment[]; segments?: RawSegment[] }
  const segments = obj.transcription ?? obj.segments ?? []
  const cues: SubtitleCue[] = []
  for (const seg of segments) {
    const text = (seg.text ?? '').trim()
    if (text.length === 0) continue
    const fromRaw = seg.offsets?.from ?? (seg.start !== undefined ? seg.start * 1000 : null)
    const toRaw = seg.offsets?.to ?? (seg.end !== undefined ? seg.end * 1000 : null)
    if (fromRaw === null || toRaw === null) continue
    const start = Math.max(0, fromRaw / 1000)
    const end = Math.min(durationSeconds, toRaw / 1000)
    if (end - start < 0.05) continue
    cues.push(...splitCue({ startSeconds: start, endSeconds: end, text }, maxChars))
  }
  return cues
}

/** Cues alineados de esta narración (offsets relativos a la escena); null si no hay alineador usable. */
export async function alignNarration(audioAbsPath: string, durationSeconds: number): Promise<SubtitleCue[] | null> {
  if (!(await alignmentAvailable())) return null
  const cfg = airshotConfig.assembly.subtitles.align
  const temp = makeTempDir('align')
  try {
    const prefix = join(temp.dir, 'aligned')
    const args = ['-m', cfg.model_path, '-f', audioAbsPath, '-oj', '-of', prefix]
    if (cfg.language.trim().length > 0) args.push('-l', cfg.language)
    const res = await runProcess(cfg.command, args, cfg.timeout_seconds * 1000)
    if (res.code !== 0) {
      logger.warn('assembly.align.failed', { code: res.code, tail: res.stderr.trim().split('\n').slice(-3).join(' | ') })
      return null
    }
    const jsonPath = `${prefix}.json`
    if (!existsSync(jsonPath)) {
      logger.warn('assembly.align.no_json', { jsonPath })
      return null
    }
    const cues = cuesFromWhisperJson(JSON.parse(readFileSync(jsonPath, 'utf8')) as unknown, durationSeconds, cfg.max_cue_chars)
    return cues.length === 0 ? null : cues
  } catch (err) {
    logger.warn('assembly.align.error', { error: err instanceof Error ? err.message : String(err) })
    return null
  } finally {
    temp.cleanup()
  }
}
