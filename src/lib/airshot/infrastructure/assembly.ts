// AirShot — infrastructure/assembly.ts (ADR-011; §6.4 AssemblyService)
// Ensamblaje del vídeo final: normaliza clips por escena (con caché reanudable) →
// concat de vídeo → narración relojada → subtítulos (sidecar/burn) → mezcla con
// música (volumen, fade, ducking) → mux. Portada opcional por escena.
// Una escena sin clip se ensambla desde su imagen base con Ken Burns local
// (assembly.still_image). Transiciones: fade a negro configurable por corte
// (assembly.transitions). Los segmentos se recortan/rellenan a la duración de la
// escena para que vídeo, narración y subtítulos compartan el mismo reloj.
// Parámetros en config.yaml (cero hardcoding). AssemblyOutcome nunca lanza sin clasificar.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { airshotConfig } from '@/lib/airshot/config/loader'
import type { Problem } from '@/lib/airshot/core/errors'
import { AppError } from '@/lib/airshot/core/errors'
import { makeTempDir, probeDuration, runFfmpeg } from '@/lib/airshot/infrastructure/ffmpeg'
import { encoderPlan, softwareEncodeArgs, type EncoderPlan } from '@/lib/airshot/infrastructure/hwaccel'
import { logger } from '@/lib/airshot/core/logger'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { alignNarration, alignmentAvailable, type SubtitleCue } from '@/lib/airshot/infrastructure/alignment'

export type AssemblySceneInput = {
  sceneId: string
  videoClipPath: string | null // storage key (null si la escena solo tiene imagen)
  imagePath: string | null // storage key (Ken Burns local cuando falta el clip)
  audioPath: string | null // storage key
  durationSeconds: number // ventana efectiva del timeline
  trimStartSeconds: number // offset de entrada en el clip de origen
  subtitleText: string | null
  translations: Record<string, string> // idioma → texto traducido (pistas SRT extra)
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
  audioLanguage: string | null
  subtitleLanguages: string[]
}

export type AssemblyProgress = { stage: string; done: number; total: number }
export type AssemblyHooks = { onProgress?: (progress: AssemblyProgress) => void | Promise<void> }

export type SubtitleMethod = 'whisper' | 'estimated' | 'mixed'

export type AssemblyArtifacts = {
  outputPath: string
  subtitlesPath: string | null
  thumbnailPath: string | null
  subtitlesMethod: SubtitleMethod | null
  subtitlesTracks: Array<{ language: string; path: string }>
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

/**
 * SRT acumulando la duración de cada escena. Con cues alineados (whisper) se usan
 * sus offsets relativos; sin ellos cae a la duración completa de la escena.
 * Las escenas sin texto se omiten.
 */
export function buildSrt(scenes: AssemblySceneInput[], cuesByScene?: Map<string, SubtitleCue[]> | null): string | null {
  const cues: string[] = []
  let cursor = 0
  scenes.forEach((scene) => {
    const text = scene.subtitleText?.trim()
    const aligned = cuesByScene?.get(scene.sceneId)
    if (aligned !== undefined && aligned.length > 0) {
      for (const cue of aligned) {
        const start = cursor + Math.max(0, Math.min(cue.startSeconds, scene.durationSeconds))
        const end = cursor + Math.max(0, Math.min(cue.endSeconds, scene.durationSeconds))
        if (end <= start) continue
        cues.push(`${cues.length + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${cue.text}\n`)
      }
    } else if (text !== undefined && text.length > 0) {
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

/** Clave de caché de normalización: visual + mtime + geometría + codificación + fades. */
type SceneVisual = { key: string; kind: 'video' | 'image' }

function visualOf(scene: AssemblySceneInput): SceneVisual {
  if (scene.videoClipPath !== null) return { key: scene.videoClipPath, kind: 'video' }
  if (scene.imagePath !== null && airshotConfig.assembly.still_image.enabled) return { key: scene.imagePath, kind: 'image' }
  throw new AppError('VALIDATION_ERROR', `escena ${scene.sceneId} sin clip ni imagen ensamblable`, { sceneId: scene.sceneId })
}

type FadeWindow = { in: boolean; out: boolean; seconds: number }

function fadeWindow(index: number, total: number, durationSeconds: number): FadeWindow | null {
  const t = airshotConfig.assembly.transitions
  if (!t.enabled || t.duration_seconds <= 0 || total < 2) return null
  return {
    in: index > 0,
    out: index < total - 1,
    seconds: Math.min(t.duration_seconds, durationSeconds / 2),
  }
}

function normalizeCacheKey(
  scene: AssemblySceneInput,
  dims: { w: number; h: number },
  index: number,
  total: number,
  encoderTag: string,
): string {
  const a = airshotConfig.assembly
  const visual = visualOf(scene)
  const stat = storage.stat(visual.key)
  const fade = fadeWindow(index, total, scene.durationSeconds)
  const material = [
    visual.kind,
    visual.key,
    String(Math.floor(stat.mtimeMs)),
    `${dims.w}x${dims.h}`,
    String(a.output_fps),
    encoderTag,
    String(a.video_crf),
    a.video_preset,
    String(scene.durationSeconds),
    String(scene.trimStartSeconds),
    visual.kind === 'image' ? String(a.still_image.zoom) : '',
    fade === null ? '' : `${String(fade.in)}|${String(fade.out)}|${fade.seconds}`,
  ].join('|')
  return `cache/assembly/${createHash('sha256').update(material).digest('hex').slice(0, 32)}.mp4`
}

/** Codifica con el plan HW si hay; ante fallo en runtime reintenta una vez en software. */
async function encodeWithPlan(baseArgs: string[], outPath: string, label: string, plan: EncoderPlan): Promise<void> {
  const a = airshotConfig.assembly
  try {
    await runFfmpeg(['-y', ...baseArgs, ...plan.args(a.video_crf, a.video_preset), outPath], label)
  } catch (err) {
    if (plan.software) throw err
    logger.warn('assembly.hwaccel_fallback', { label, encoder: plan.tag, detail: err instanceof Error ? err.message : String(err) })
    // el intento fallido puede haber dejado un fichero vacío: -y evita el prompt interactivo y el cuelgue
    await runFfmpeg(['-y', ...baseArgs, ...softwareEncodeArgs(a.video_crf, a.video_preset), outPath], `${label}-software`)
  }
}

/** Cadena de filtros del segmento: geometría, Ken Burns (imagen) y fades de transición. */
async function segmentFilters(
  scene: AssemblySceneInput,
  visual: SceneVisual,
  dims: { w: number; h: number },
  fade: FadeWindow | null,
): Promise<{ filters: string[]; frames: number | null }> {
  const a = airshotConfig.assembly
  const filters: string[] = []
  let frames: number | null = null
  if (visual.kind === 'image') {
    frames = Math.max(2, Math.round(scene.durationSeconds * a.output_fps))
    const zoom = a.still_image.zoom
    const zoomExpr = `min(1+${zoom}*on/${frames},${(1 + zoom).toFixed(3)})`
    filters.push(
      `scale=${dims.w * 2}:${dims.h * 2}:force_original_aspect_ratio=increase`,
      `crop=${dims.w * 2}:${dims.h * 2}`,
      `zoompan=z='${zoomExpr}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${dims.w}x${dims.h}:fps=${a.output_fps}`,
    )
  } else {
    filters.push(
      `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=decrease`,
      `pad=${dims.w}:${dims.h}:(ow-iw)/2:(oh-ih)/2`,
      `fps=${a.output_fps}`,
    )
    const probed = await probeDuration(storage.abs(visual.key))
    const sourceRemaining = probed === null ? null : Math.max(0, probed - scene.trimStartSeconds)
    if (sourceRemaining !== null && sourceRemaining < scene.durationSeconds - 0.05) {
      filters.push(`tpad=stop_mode=clone:stop_duration=${(scene.durationSeconds - sourceRemaining).toFixed(3)}`)
    }
  }
  filters.push('format=yuv420p')
  if (fade !== null) {
    if (fade.in) filters.push(`fade=t=in:st=0:d=${fade.seconds.toFixed(3)}`)
    if (fade.out) filters.push(`fade=t=out:st=${Math.max(0, scene.durationSeconds - fade.seconds).toFixed(3)}:d=${fade.seconds.toFixed(3)}`)
  }
  return { filters, frames }
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
    const plan = await encoderPlan()

    // 1) normalización de visuales con caché (reanudar un job fallido no re-renderiza)
    const normalized: string[] = []
    for (let i = 0; i < scenes.length; i++) {
      const cacheKey = normalizeCacheKey(scenes[i], dims, i, scenes.length, plan.tag)
      if (storage.exists(cacheKey)) {
        normalized.push(storage.abs(cacheKey))
      } else {
        const visual = visualOf(scenes[i])
        const fade = fadeWindow(i, scenes.length, scenes[i].durationSeconds)
        const { filters, frames } = await segmentFilters(scenes[i], visual, dims, fade)
        const normPath = join(temp.dir, `norm${i}.mp4`)
        const inputArgs = visual.kind === 'image'
          ? ['-loop', '1', '-i', storage.abs(visual.key)]
          : [...(scenes[i].trimStartSeconds > 0 ? ['-ss', scenes[i].trimStartSeconds.toFixed(3)] : []), '-i', storage.abs(visual.key)]
        const frameArgs = frames === null ? [] : ['-frames:v', String(frames)]
        await encodeWithPlan([
          ...inputArgs,
          '-vf', filters.join(','),
          ...frameArgs,
          '-an',
          '-t', String(scenes[i].durationSeconds),
        ], normPath, `norm-scene-${i}`, plan)
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

    // 5) subtítulos: alineación opcional (whisper) + sidecar SRT y/o burn-in
    let srt: string | null = null
    let subtitlesMethod: SubtitleMethod | null = null
    let cuesByScene: Map<string, SubtitleCue[]> | null = null
    if (params.subtitles !== 'none' || params.subtitleLanguages.length > 0) {
      const audioScenes = scenes.filter((s) => s.audioPath !== null)
      if (params.subtitles !== 'none' && params.includeAudio && audioScenes.length > 0 && (await alignmentAvailable())) {
        const aligned = new Map<string, SubtitleCue[]>()
        for (let i = 0; i < audioScenes.length; i++) {
          const cues = await alignNarration(storage.abs(audioScenes[i].audioPath as string), audioScenes[i].durationSeconds)
          if (cues !== null) aligned.set(audioScenes[i].sceneId, cues)
          await report('align', i + 1, audioScenes.length)
        }
        if (aligned.size > 0) cuesByScene = aligned
      }
      srt = buildSrt(scenes, cuesByScene)
      if (srt !== null) {
        subtitlesMethod = cuesByScene === null
          ? 'estimated'
          : cuesByScene.size === audioScenes.length ? 'whisper' : 'mixed'
      }
    }
    let subtitlesPath: string | null = null
    const subtitlesTracks: Array<{ language: string; path: string }> = []
    for (const language of params.subtitleLanguages) {
      const languageSrt = buildSrt(scenes.map((scene) => ({ ...scene, subtitleText: scene.translations[language] ?? null })), null)
      if (languageSrt === null) continue
      const trackPath = storage.assemblySubtitles(projectId, jobId, language)
      storage.save(trackPath, Buffer.from(languageSrt, 'utf8'))
      subtitlesTracks.push({ language, path: trackPath })
    }
    let videoForMux = videoPath
    if (srt !== null && params.subtitles !== 'none') {
      subtitlesPath = storage.assemblySubtitles(projectId, jobId)
      storage.save(subtitlesPath, Buffer.from(srt, 'utf8'))
      if (params.subtitles === 'burn') {
        const srtTemp = join(temp.dir, 'subtitles.srt')
        writeFileSync(srtTemp, srt, 'utf8')
        const burnPath = join(temp.dir, 'video_subs.mp4')
        const style = `FontSize=${a.subtitles.font_size},MarginV=${a.subtitles.margin_v},Outline=1`
        await encodeWithPlan([
          '-i', videoPath,
          '-vf', `subtitles=filename='${escapeFilterPath(srtTemp)}':force_style='${style}'`,
          '-an',
        ], burnPath, 'burn-subtitles', plan)
        videoForMux = burnPath
      }
      await report('subtitles', 1, 1)
    }

    // 6) portada opcional: primer fotograma del visual de la escena elegida
    let thumbnailPath: string | null = null
    if (params.coverSceneId !== null) {
      const coverScene = scenes.find((s) => s.sceneId === params.coverSceneId)
      if (coverScene === undefined) {
        throw new AppError('VALIDATION_ERROR', `coverSceneId ${params.coverSceneId} no pertenece al proyecto`, { field: 'coverSceneId' })
      }
      const coverTemp = join(temp.dir, 'cover.jpg')
      await runFfmpeg(['-y', '-i', storage.abs(visualOf(coverScene).key), '-frames:v', '1', '-q:v', '3', coverTemp], 'cover-frame')
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
    return { outputPath: outputKey, subtitlesPath, thumbnailPath, subtitlesMethod, subtitlesTracks }
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
