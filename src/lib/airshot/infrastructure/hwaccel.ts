// AirShot — infrastructure/hwaccel.ts
// Elección honesta del encoder de vídeo para la normalización de segmentos:
// si assembly.hwaccel.enabled y ffmpeg lista uno de los encoders preferidos
// (nvenc/qsv/amf/videotoolbox) se usa; si no, libx264 configurado.
// La detección se cachea por proceso; el fallo en runtime vuelve a software.

import { airshotConfig } from '@/lib/airshot/config/loader'
import { logger } from '@/lib/airshot/core/logger'
import { runProcess } from '@/lib/airshot/infrastructure/ffmpeg'

export type EncoderPlan = {
  tag: string
  software: boolean
  args: (crf: number, preset: string) => string[]
}

export function softwareEncodeArgs(crf: number, preset: string): string[] {
  return softwareArgs(airshotConfig.assembly.video_codec, crf, preset)
}

function softwareArgs(codec: string, crf: number, preset: string): string[] {
  return ['-c:v', codec, '-crf', String(crf), '-preset', preset]
}

function planFor(encoder: string): EncoderPlan {
  const a = airshotConfig.assembly
  const software: EncoderPlan = { tag: `${a.video_codec}:${a.video_preset}`, software: true, args: (crf, preset) => softwareArgs(a.video_codec, crf, preset) }
  switch (encoder) {
    case 'h264_nvenc':
      return { tag: encoder, software: false, args: (crf) => ['-c:v', encoder, '-preset', 'p4', '-rc', 'vbr', '-cq', String(crf), '-b:v', '0'] }
    case 'h264_qsv':
      return { tag: encoder, software: false, args: (crf) => ['-c:v', encoder, '-global_quality', String(crf), '-preset', 'medium'] }
    case 'h264_amf':
      return { tag: encoder, software: false, args: (crf) => ['-c:v', encoder, '-quality', 'balanced', '-qp_i', String(crf), '-qp_p', String(crf)] }
    case 'h264_videotoolbox':
      return { tag: encoder, software: false, args: (crf) => ['-c:v', encoder, '-q:v', String(Math.max(10, Math.min(80, Math.round((51 - crf) * 1.4))))] }
    default:
      return software
  }
}

function testArgsFor(encoder: string): string[] {
  return planFor(encoder).args(23, 'medium')
}

/** Un encoder listado puede no tener hardware detrás (nvcuda.dll ausente, GPU ocupada…). */
async function usable(encoder: string): Promise<boolean> {
  const res = await runProcess(
    airshotConfig.assembly.ffmpeg_path,
    ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.2', '-frames:v', '1', ...testArgsFor(encoder), '-f', 'null', '-'],
    8_000,
  ).catch(() => null)
  return res !== null && res.code === 0
}

async function detect(): Promise<EncoderPlan> {
  const hw = airshotConfig.assembly.hwaccel
  if (!hw.enabled || hw.preferred.length === 0) return planFor('')
  try {
    // `-encoders` imprime el listado en stdout en ffmpeg recientes; se concatenan ambos por compatibilidad
    const res = await runProcess(airshotConfig.assembly.ffmpeg_path, ['-hide_banner', '-encoders'], 10_000)
    const listing = `${res.stdout}\n${res.stderr}`
    for (const encoder of hw.preferred) {
      if (!new RegExp(`\\b${encoder}\\b`).test(listing)) continue
      if (!(await usable(encoder))) {
        logger.info('hwaccel.unusable', { encoder })
        continue
      }
      logger.info('hwaccel.selected', { encoder })
      return planFor(encoder)
    }
    logger.info('hwaccel.none', { preferred: hw.preferred })
    return planFor('')
  } catch (err) {
    logger.warn('hwaccel.probe_failed', { error: err instanceof Error ? err.message : String(err) })
    return planFor('')
  }
}

let planPromise: Promise<EncoderPlan> | null = null

/** Plan de codificación cacheado por proceso (la detección se hace una vez). */
export function encoderPlan(): Promise<EncoderPlan> {
  if (planPromise === null) planPromise = detect()
  return planPromise
}

export function resetEncoderPlanForTests(): void {
  planPromise = null
}
