// AirShot — infrastructure/assembly.ts (ADR-011; §6.4 AssemblyService)
// Ensamblaje del vídeo final: normaliza clips por escena → concat de vídeo →
// pista de narración (padding/trim al cómputo de cada clip) → mezcla con música
// (volumen + fade out final) → mux. Parámetros de config.yaml (cero hardcoding).
// AssemblyOutcome = { outputPath } | { problem } — nunca lanza sin clasificar.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { airshotConfig } from '@/lib/airshot/config/loader'
import type { Problem } from '@/lib/airshot/core/errors'
import { AppError } from '@/lib/airshot/core/errors'
import { makeTempDir, runFfmpeg } from '@/lib/airshot/infrastructure/ffmpeg'
import { storage } from '@/lib/airshot/infrastructure/storage'

export type AssemblySceneInput = {
  sceneId: string
  videoClipPath: string // storage key
  audioPath: string | null // storage key
  durationSeconds: number
}

export type AssemblyParams = {
  includeAudio: boolean
  musicAssetKey: string | null
  musicVolume: number
  resolution: '720p' | '1080p'
}

export type AssemblyOutcome = { outputPath: string } | { problem: Problem }

const RESOLUTIONS: Record<string, { w: number; h: number }> = {
  '720p': { w: 1280, h: 720 },
  '1080p': { w: 1920, h: 1080 },
}

function buildListFile(dir: string, files: string[]): string {
  const path = join(dir, 'list.txt')
  const content = files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
  writeFileSync(path, content)
  return path
}

export async function assembleProject(
  projectId: string,
  jobId: string,
  scenes: AssemblySceneInput[],
  params: AssemblyParams,
): Promise<AssemblyOutcome> {
  const temp = makeTempDir('assemble')
  try {
    const a = airshotConfig.assembly
    const dims = RESOLUTIONS[params.resolution] ?? RESOLUTIONS['720p']

    // 1) normalización de clips (fps/pix/codec/resolución uniformes → concat -c copy)
    const normalized: string[] = []
    for (let i = 0; i < scenes.length; i++) {
      const normPath = join(temp.dir, `norm${i}.mp4`)
      await runFfmpeg([
        '-i', storage.abs(scenes[i].videoClipPath),
        '-vf', `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2,fps=${a.output_fps},format=yuv420p`,
        '-an',
        '-c:v', a.video_codec, '-crf', String(a.video_crf), '-preset', a.video_preset,
        normPath,
      ], `norm-scene-${i}`)
      normalized.push(normPath)
    }

    // 2) concat de vídeo
    const videoPath = join(temp.dir, 'video.mp4')
    const videoList = buildListFile(temp.dir, normalized)
    await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', videoList, '-c', 'copy', videoPath], 'concat-video')

    // 3) pista de narración: cada narración se relojea a la duración de su clip
    const narrations: string[] = []
    if (params.includeAudio) {
      for (let i = 0; i < scenes.length; i++) {
        if (scenes[i].audioPath === null) continue
        const target = join(temp.dir, `narr${i}.wav`)
        await runFfmpeg([
          '-i', storage.abs(scenes[i].audioPath as string),
          '-ar', String(a.audio_sample_rate),
          '-ac', String(a.audio_channels),
          '-af', 'apad',
          '-t', String(scenes[i].durationSeconds),
          '-c:a', 'pcm_s16le',
          target,
        ], `narr-scene-${i}`)
        narrations.push(target)
      }
    }

    let finalAudioPath: string | null = null
    if (narrations.length > 0) {
      const narrationPath = join(temp.dir, 'narration.wav')
      const narrList = buildListFile(temp.dir, narrations)
      await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', narrList, '-c', 'copy', narrationPath], 'concat-narration')
      finalAudioPath = narrationPath
    }

    const totalSeconds = scenes.reduce((acc, s) => acc + s.durationSeconds, 0)

    if (params.musicAssetKey !== null) {
      // 4) mezcla con música (o música sola si no hay narración): volumen + fade out
      const fadeStart = Math.max(0, totalSeconds - a.music_fade_out_seconds)
      const musicFilter = `atrim=0:${totalSeconds.toFixed(3)},asetpts=N/SR/TB,volume=${params.musicVolume},afade=t=out:st=${fadeStart.toFixed(3)}:d=${a.music_fade_out_seconds}`
      const mixedPath = join(temp.dir, 'mix.wav')
      if (finalAudioPath !== null) {
        await runFfmpeg([
          '-i', finalAudioPath,
          '-i', storage.abs(params.musicAssetKey),
          '-filter_complex', `[1:a]${musicFilter}[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[aout]`,
          '-map', '[aout]', '-c:a', 'pcm_s16le',
          mixedPath,
        ], 'mix-music')
      } else {
        await runFfmpeg([
          '-i', storage.abs(params.musicAssetKey),
          '-filter_complex', `[0:a]${musicFilter}[aout]`,
          '-map', '[aout]', '-c:a', 'pcm_s16le',
          mixedPath,
        ], 'music-only')
      }
      finalAudioPath = mixedPath
    }

    // 5) mux final (faststart para descarga progresiva)
    const outputKey = storage.assemblyOutput(projectId, jobId)
    const finalPath = join(temp.dir, 'final.mp4')
    const muxArgs: string[] = ['-i', videoPath]
    if (finalAudioPath !== null) {
      muxArgs.push('-i', finalAudioPath, '-c:v', 'copy', '-c:a', 'aac', '-b:a', `${a.audio_bitrate_kbps}k`, '-shortest')
    } else {
      muxArgs.push('-c', 'copy')
    }
    muxArgs.push('-movflags', '+faststart', finalPath)
    await runFfmpeg(muxArgs, 'mux-final')

    storage.save(outputKey, readFileSync(finalPath))
    return { outputPath: outputKey }
  } catch (err) {
    if (err instanceof AppError) {
      return { problem: err.problem }
    }
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    return { problem: new AppError('INTERNAL_ERROR', `ensamblaje falló: ${detail}`).problem }
  } finally {
    temp.cleanup()
  }
}
