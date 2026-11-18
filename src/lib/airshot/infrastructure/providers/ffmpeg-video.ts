// AirShot — infrastructure/providers/ffmpeg-video.ts (ADR-016)
// VideoProvider local: genera un clip REAL desde la imagen base de la escena con
// zoompan (Ken Burns) + duración solicitada. Es el proveedor por defecto del
// sandbox para que el pipeline completo funcione sin API keys externas.
// supported_durations: [] (contino en [scene.min, scene.max]); usa 1 imagen (la base).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { airshotConfig } from '@/lib/airshot/config/loader'
import type { ProviderEntry } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { makeTempDir, runFfmpeg } from '@/lib/airshot/infrastructure/ffmpeg'
import type { VideoGenerationRequest, VideoGenerationResult, VideoProvider } from '@/lib/airshot/infrastructure/providers/types'

const RESOLUTIONS: Record<string, { w: number; h: number }> = {
  '720p': { w: 1280, h: 720 },
  '1080p': { w: 1920, h: 1080 },
}

export class FfmpegKenBurnsVideoProvider implements VideoProvider {
  readonly name: string
  constructor(
    name: string,
    private readonly entry: ProviderEntry,
    private readonly _defaultParams: Record<string, unknown>,
  ) {
    this.name = name
  }

  capabilities(): { supportedDurations: number[]; referenceImageLimit: number } {
    // reference_image_limit=1: el slot lo consume la imagen base (Ken Burns es
    // image-to-video de UNA imagen; las referencias influyen vía prompt y política de nivel)
    return {
      supportedDurations: this.entry.supported_durations ?? [],
      referenceImageLimit: this.entry.reference_image_limit ?? 1,
    }
  }

  async generate(req: VideoGenerationRequest): Promise<VideoGenerationResult> {
    if (req.imageAbsPath === null) {
      throw new AppError('STATE_CONFLICT', 'image-to-video requiere imagen base (imageBasePath null)', {
        sceneId: req.sceneId,
        hints: ['Genera o sube la imagen base de la escena antes del vídeo.'],
      })
    }
    const dims = RESOLUTIONS[req.resolution] ?? RESOLUTIONS['720p']
    const fps = airshotConfig.assembly.output_fps
    const frames = Math.max(1, Math.round(req.durationSeconds * fps))
    const temp = makeTempDir('kbclip')
    try {
      const out = join(temp.dir, 'clip.mp4')
      // receta Ken Burns clásica: upscale 2x → zoompan centrado → yuv420p 8-bit
      const vf = [
        `scale=${dims.w * 2}:${dims.h * 2}:force_original_aspect_ratio=increase`,
        `crop=${dims.w * 2}:${dims.h * 2}`,
        `zoompan=z='min(1+0.10*on/${frames},1.10)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${dims.w}x${dims.h}:fps=${fps}`,
        'format=yuv420p',
      ].join(',')
      await runFfmpeg([
        '-loop', '1',
        '-i', req.imageAbsPath,
        '-vf', vf,
        '-frames:v', String(frames),
        '-c:v', airshotConfig.assembly.video_codec,
        '-crf', String(airshotConfig.assembly.video_crf),
        '-preset', airshotConfig.assembly.video_preset,
        '-r', String(fps),
        out,
      ], `kenburns-scene-${req.sceneId.slice(0, 8)}`)
      return {
        clipBytes: readFileSync(out),
        effectiveDurationSeconds: req.durationSeconds,
        providerJobId: `ffmpeg-${randomUUID()}`,
      }
    } finally {
      temp.cleanup()
    }
  }
}
