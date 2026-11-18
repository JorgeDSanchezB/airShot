// AirShot — infrastructure/ffmpeg.ts (ADR-011)
// Subprocess de ffmpeg/ffprobe SIN shell (args en arreglo), con timeout.
// Toda falla se clasifica: timeout → PROVIDER_TIMEOUT (504, reintentable);
// salida no cero → INTERNAL_ERROR con cola de stderr (nunca sin clasificar).

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'

export type RunResult = { code: number; stdout: string; stderr: string }

export function runProcess(binary: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(binary, args, { shell: false })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill('SIGKILL')
        rejectPromise(new AppError('PROVIDER_TIMEOUT', `${binary} excedió el timeout de ${Math.round(timeoutMs / 1000)}s`, { provider: 'ffmpeg' }))
      }
    }, timeoutMs)
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectPromise(new AppError('PROVIDER_UNAVAILABLE', `${binary} no ejecutable: ${err.message}`, { provider: 'ffmpeg' }))
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({ code: code ?? -1, stdout, stderr })
    })
  })
}

/** ffmpeg con clasificación de errores según taxonomía §3.1.1. */
export async function runFfmpeg(args: string[], label: string): Promise<RunResult> {
  const res = await runProcess(airshotConfig.assembly.ffmpeg_path, ['-hide_banner', '-loglevel', 'error', ...args], airshotConfig.assembly.job_timeout_seconds * 1000)
  if (res.code !== 0) {
    const tail = res.stderr.trim().split('\n').slice(-5).join(' | ')
    throw new AppError('INTERNAL_ERROR', `ffmpeg falló (${label}): ${tail || 'sin stderr'}`)
  }
  return res
}

export async function ffmpegVersion(): Promise<string> {
  const res = await runProcess(airshotConfig.assembly.ffmpeg_path, ['-version'], 10_000)
  return res.stdout.split('\n')[0]?.trim() ?? 'ffmpeg'
}

export async function ffprobeVersion(): Promise<string> {
  const res = await runProcess(airshotConfig.assembly.ffprobe_path, ['-version'], 10_000)
  return res.stdout.split('\n')[0]?.trim() ?? 'ffprobe'
}

/** Duración (s) de un archivo de media; null si no se puede determinar. */
export async function probeDuration(absPath: string): Promise<number | null> {
  const res = await runProcess(
    airshotConfig.assembly.ffprobe_path,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', absPath],
    30_000,
  )
  if (res.code !== 0) return null
  try {
    const parsed = JSON.parse(res.stdout) as { format?: { duration?: string } }
    const d = parsed.format?.duration
    return d !== undefined ? Number(d) : null
  } catch {
    return null
  }
}

/** Análisis de sonoridad EBU R128 (integrated LUFS + true peak dBFS). */
export async function probeLoudness(absPath: string): Promise<{ lufs: number | null; truePeakDb: number | null }> {
  const res = await runProcess(
    airshotConfig.assembly.ffmpeg_path,
    ['-hide_banner', '-nostats', '-i', absPath, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'],
    120_000,
  )
  // ffmpeg escribe el summary en stderr
  const sums = [...res.stderr.matchAll(/I:\s+(-?\d+\.?\d*)\s+LUFS/g)]
  const peaks = [...res.stderr.matchAll(/Peak:\s+(-?\d+\.?\d*)\s+dBFS/g)]
  const lufs = sums.length > 0 ? Number(sums[sums.length - 1][1]) : null
  const truePeakDb = peaks.length > 0 ? Number(peaks[peaks.length - 1][1]) : null
  return { lufs, truePeakDb }
}

/** Directorio temporal gestionado; devuelve cleaner. */
export function makeTempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), `airshot-${prefix}-`))
  return { dir, cleanup: () => { try { rmSync(dir, { recursive: true, force: true }) } catch { /* best-effort */ } } }
}
