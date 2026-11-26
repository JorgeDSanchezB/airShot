// AirShot — infrastructure/assembly.ts (ADR-011; §6.4 AssemblyService)
// Ensamblaje del vídeo final: normaliza clips por escena (con caché reanudable) →
// concat de vídeo → narración relojada → subtítulos (sidecar/burn) → mezcla con
// música (volumen, fade, ducking) → mux. Portada opcional por escena.
// Parámetros en config.yaml (cero hardcoding). AssemblyOutcome nunca lanza sin clasificar.

import { createHash } from 'node:crypto'
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
  subtitleText: string | null
}

export type SubtitleMode = 'none' | 'srt' | 'burn'

export type AssemblyParams = {
  includeAudio: boolean
  musicAssetKey: string | null
  musicVolume: number
  resolution: '720p' | '1080p'
  aspect: string
  subtitles: SubtitleMode
  duckMusic: boolean
  coverSceneId: string | null
}

export type AssemblyProgress = { stage: string; done: number; total: number }
export type AssemblyHooks = { onProgress?: (progress: AssemblyProgress) => void | Promise<void> }

export type AssemblyArtifacts = {
  outputPath: string
  subtitlesPath: string | null
  thumbnailPath: string | null
}

export type AssemblyOutcome = AssemblyArtifacts | { problem: Problem }

const BASE_HEIGHT: Record<string, number> = { '720p': 720, '1080p': 1080 }

function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

/** Dimensiones del lienzo: el lado corto queda en 720/1080; ratios en config. */
export function dimsFor(resolution: '720p' | '1080p', aspect: string): { w: number; h: number } {
  const ratio = airshotConfig.assembly.aspect_ratios[aspect]
  if (ratio === undefined) {
    throw new AppError('VALIDATION_ERROR', `aspect "${aspect}" no está en assembly.aspect_ratios (${Object.keys(airshotConfig.assembly.aspect_ratios).join('|')})`, { field: 'aspect' })
  }
  const [rw, rh] = ratio
  const base = BASE_HEIGHT[resolution] ?? BASE_HEIGHT['720p']
  const short = Math.min(rw, rh)
  return { w: even((base * rw) / short), h: even((base * rh) / short) }
}

function srtTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const rest = ms % 1000
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(rest, 3)}`
}

/** SRT acumulando la duración real de cada clip; las escenas sin texto se omiten. */
export function buildSrt(scenes: AssemblySceneInput[]): string | null {
  const cues: string[] = []
  let cursor = 0
  scenes.forEach((scene, index) => {
    const text = scene.subtitleText?.trim()
    if (text !== undefined && text.length > 0) {
      const start = cursor
      const end = cursor + scene.durationSeconds
      cues.push(`${cues.length + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${text}\n`)
    }
    cursor += scene.durationSeconds
  })
  return cues.length === 0 ? null : `${cues.join('\n')}\n`
}

/** Escapa una ruta para el filtro subtitles de FFmpeg (comas, dos puntos, comillas). */
export function escapeFilterPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

function buildListFile(dir: string, files: string[]): string {
  const path = join(dir, 'list.txt')
  const content = files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
  writeFileSync(path, content)
  return path
}

/** Clave de caché de normalización: clip + mtime + geometría + codificación. */
function normalizeCacheKey(scene: AssemblySceneInput, dims: { w: number; h: number }): string {
  const a = airshotConfig.assembly
  const stat = storage.stat(scene.videoClipPath)
  const material = [
    scene.videoClipPath,
    String(Math.floor(stat.mtimeMs)),
    `${dims.w}x${dims.h}`,
    String(a.output_fps),
    a.video_codec,
    String(a.video_crf),
    a.video_preset,
  ].join('|')
  return `cache/assembly/${createHash('sha256').update(material).digest('hex').slice(0, 32)}.mp4`
}

export async function assembleProject(
  projectId: string,
  jobId: string,
  scenes: AssemblySceneInput[],
  params: AssemblyParams,
  hooks: AssemblyHooks = {},
): Promise<AssemblyOutcome> {
  const report = async (stage: string, done: number, total: number): Promise<void> => {
    await hooks.onProgress?.({ stage, done, total })
  }
  const temp = makeTempDir('assemble')
  try {
    const a = airshotConfig.assembly
    const dims = dimsFor(params.resolution, params.aspect)

    // 1) normalización de clips con caché (reanudar un job fallido no re-renderiza)
    const normalized: string[] = []
    for (let i = 0; i < scenes.length; i++) {
      const cacheKey = normalizeCacheKey(scenes[i], dims)
      if (storage.exists(cacheKey)) {
        normalized.push(storage.abs(cacheKey))
      } else {
        const normPath = join(temp.dir, `norm${i}.mp4`)
        await runFfmpeg([
          '-i', storage.abs(scenes[i].videoClipPath),
          '-vf', `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease,pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2,fps=${a.output_fps},format=yuv420p`,
          '-an',
          '-c:v', a.video_codec, '-crf', String(a.video_crf), '-preset', a.video_preset,
          normPath,
        ], `norm-scene-${i}`)
        storage.save(cacheKey, readFileSync(normPath))
        normalized.push(storage.abs(cacheKey))
      }
      await report('normalize', i + 1, scenes.length)
    }

    // 2) concat de vídeo
    const videoPath = join(temp.dir, 'video.mp4')
    const videoList = buildListFile(temp.dir, normalized)
    await runFfmpeg(['-f', 'concat', '-safe', '0', '-i', videoList, '-c', 'copy', videoPath], 'concat-video')
    await report('concat', 1, 1)

    // 3) pista de narración: cada narración se relojea a la duración de su clip
    const narrations: string[] = []
    if (params.includeAudio) {
      const audioScenes = scenes.filter((s) => s.audioPath !== null).length
      let done = 0
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
        done++
        await report('narration', done, audioScenes)
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

    // 4) música: volumen + fade (ducking opcional contra la narración)
    if (params.musicAssetKey !== null) {
      const fadeStart = Math.max(0, totalSeconds - a.music_fade_out_seconds)
      const musicFilter = `atrim=0:${totalSeconds.toFixed(3)},asetpts=N/SR/TB,volume=${params.musicVolume},afade=t=out:st=${fadeStart.toFixed(3)}:d=${a.music_fade_out_seconds}`
      const mixedPath = join(temp.dir, 'mix.wav')
      if (finalAudioPath !== null && params.duckMusic) {
        const { threshold, ratio: duckRatio } = a.music_ducking
        await runFfmpeg([
          '-i', finalAudioPath,
          '-i', storage.abs(params.musicAssetKey),
          '-filter_complex',
          `[0:a]asplit=2[n1][n2];[1:a]${musicFilter}[mg];[mg][n1]sidechaincompress=threshold=${threshold}:ratio=${duckRatio}[duck];[n2][duck]amix=inputs=2:duration=first:normalize=0[aout]`,
          '-map', '[aout]', '-c:a', 'pcm_s16le',
          mixedPath,
        ], 'mix-duck')
      } else if (finalAudioPath !== null) {
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
      await report('music', 1, 1)
    }

    // 5) subtítulos: sidecar SRT y/o burn-in sobre el vídeo concatenado
    const srt = params.subtitles === 'none' ? null : buildSrt(scenes)
    let subtitlesPath: string | null = null
    let videoForMux = videoPath
    if (srt !== null) {
      subtitlesPath = storage.assemblySubtitles(projectId, jobId)
      storage.save(subtitlesPath, Buffer.from(srt, 'utf8'))
      if (params.subtitles === 'burn') {
        const srtTemp = join(temp.dir, 'subtitles.srt')
        writeFileSync(srtTemp, srt, 'utf8')
        const burnPath = join(temp.dir, 'video_subs.mp4')
        const style = `FontSize=${a.subtitles.font_size},MarginV=${a.subtitles.margin_v},Outline=1`
        await runFfmpeg([
          '-i', videoPath,
          '-vf', `subtitles=filename='${escapeFilterPath(srtTemp)}':force_style='${style}'`,
          '-an',
          '-c:v', a.video_codec, '-crf', String(a.video_crf), '-preset', a.video_preset,
          burnPath,
        ], 'burn-subtitles')
        videoForMux = burnPath
      }
      await report('subtitles', 1, 1)
    }

    // 6) portada opcional: primer fotograma del clip de la escena elegida
    let thumbnailPath: string | null = null
    if (params.coverSceneId !== null) {
      const coverScene = scenes.find((s) => s.sceneId === params.coverSceneId)
      if (coverScene === undefined) {
        throw new AppError('VALIDATION_ERROR', `coverSceneId ${params.coverSceneId} no pertenece al proyecto`, { field: 'coverSceneId' })
      }
      const coverTemp = join(temp.dir, 'cover.jpg')
      await runFfmpeg(['-y', '-i', storage.abs(coverScene.videoClipPath), '-frames:v', '1', '-q:v', '3', coverTemp], 'cover-frame')
      thumbnailPath = storage.assemblyThumbnail(projectId, jobId)
      storage.save(thumbnailPath, readFileSync(coverTemp))
      await report('cover', 1, 1)
    }

    // 7) mux final (faststart para descarga progresiva)
    const outputKey = storage.assemblyOutput(projectId, jobId)
    const finalPath = join(temp.dir, 'final.mp4')
    const muxArgs: string[] = ['-i', videoForMux]
    if (finalAudioPath !== null) {
      muxArgs.push('-i', finalAudioPath, '-c:v', 'copy', '-c:a', 'aac', '-b:a', `${a.audio_bitrate_kbps}k`, '-shortest')
    } else {
      muxArgs.push('-c', 'copy')
    }
    muxArgs.push('-movflags', '+faststart', finalPath)
    await runFfmpeg(muxArgs, 'mux-final')

    storage.save(outputKey, readFileSync(finalPath))
    await report('mux', 1, 1)
    return { outputPath: outputKey, subtitlesPath, thumbnailPath }
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
