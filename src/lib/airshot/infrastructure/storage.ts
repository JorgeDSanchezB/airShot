// AirShot — infrastructure/storage.ts (§3.5, §6.4 StorageService)
// Sistema de archivos local bajo data.root con contención de rutas: la clave se
// normaliza y se comprueba que resuelve DENTRO del root (las claves las genera
// el servidor; nunca se aceptan rutas del cliente). resolveUrl → /api/v1/media/<key>.

import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'

export type AssetKind = 'image' | 'video' | 'audio' | 'music' | 'report'

export class StorageService {
  readonly root: string

  constructor() {
    this.root = resolve(process.cwd(), airshotConfig.storage.root)
  }

  /** Contención: normaliza y garantiza que el path absoluto queda bajo root. */
  abs(key: string): string {
    if (key.length === 0 || key.includes('..') || key.includes('\\')) {
      throw new AppError('VALIDATION_ERROR', `clave de storage ilegal: "${key}"`)
    }
    const abs = resolve(this.root, key)
    if (abs !== this.root && !abs.startsWith(this.root + sep)) {
      throw new AppError('VALIDATION_ERROR', `clave de storage fuera del root: "${key}"`)
    }
    return abs
  }

  save(key: string, content: Buffer): void {
    const abs = this.abs(key)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }

  open(key: string): Buffer {
    return readFileSync(this.abs(key))
  }

  exists(key: string | null | undefined): boolean {
    if (key === null || key === undefined || key.length === 0) return false
    try {
      return statSync(this.abs(key)).isFile()
    } catch {
      return false
    }
  }

  delete(key: string | null | undefined): void {
    if (key === null || key === undefined || key.length === 0) return
    try {
      unlinkSync(this.abs(key))
    } catch {
      // huérfano ya borrado: se declara, no se oculta con catch vacío
      console.warn(`[airshot] storage: delete de huérfano inexistente "${key}"`)
    }
  }

  resolveUrl(key: string | null | undefined): string | null {
    if (key === null || key === undefined || key.length === 0) return null
    return `/api/v1/media/${key}`
  }

  // ---- generación de claves por el servidor (§3.5) ----

  sceneAsset(kind: 'image' | 'video' | 'audio', projectId: string, sceneId: string, source: 'upload' | 'ai', ext: string): string {
    const dir = `${source === 'upload' ? 'uploads' : 'outputs'}/projects/${projectId}/scenes/${sceneId}`
    const prefix = kind === 'image' ? 'image' : kind === 'video' ? 'clip' : 'narration'
    return join(dir, `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`)
  }

  musicAsset(projectId: string, ext: string): string {
    return `uploads/projects/${projectId}/music_${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`
  }

  referenceImage(referenceId: string, source: 'upload' | 'ai', ext: string): string {
    const dir = `${source === 'upload' ? 'uploads' : 'outputs'}/references/${referenceId}`
    return join(dir, `image_${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`)
  }

  assemblyOutput(projectId: string, jobId: string): string {
    return `outputs/projects/${projectId}/assemblies/${jobId}/final.mp4`
  }

  reportOutput(projectId: string, jobId: string): string {
    return `outputs/projects/${projectId}/${airshotConfig.audio_qa.earshot.report_dir}/${jobId}.json`
  }
}

declare global {
  var __airshotStorage: StorageService | undefined
}

export const storage: StorageService = globalThis.__airshotStorage ?? new StorageService()
if (globalThis.__airshotStorage === undefined) globalThis.__airshotStorage = storage
