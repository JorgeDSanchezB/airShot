// AirShot — services/misc.ts
// Música de proyecto (upload/delete), voces TTS, salud y config runtime
// (GET /api/v1/config expone los grupos de límites de negocio del Anexo A —
// storage y security excluidos por decisión del árbitro, ronda 1).

import { db } from '@/lib/db'
import { airshotConfig, airshotRegistry } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { probeDuration, ffmpegVersion, ffprobeVersion } from '@/lib/airshot/infrastructure/ffmpeg'
import { getTTSProvider } from '@/lib/airshot/infrastructure/providers/factory'
import { parseBasicPageQuery } from '@/lib/airshot/core/pagination'
import type { VoiceInfo } from '@/lib/airshot/infrastructure/providers/types'
import { getProjectOr404 } from '@/lib/airshot/services/projects'
import { readUpload } from '@/lib/airshot/services/uploads'
import type { Page } from '@/lib/airshot/core/pagination'

// ---------------------------------------------------------------- música

export async function uploadMusic(projectId: string, file: { buffer: Buffer; ext: string; originalName: string | null }): Promise<{ musicAssetKey: string; durationSeconds: number | null }> {
  const project = await getProjectOr404(projectId)
  const previous = project.musicAssetKey
  const key = storage.musicAsset(projectId, file.ext)
  storage.save(key, file.buffer)
  const durationSeconds = await probeDuration(storage.abs(key))
  await db.project.update({
    where: { id: projectId },
    data: {
      musicAssetKey: key,
      musicOriginalName: file.originalName,
      musicDurationSeconds: durationSeconds,
    },
  })
  if (previous !== null && previous !== key) storage.delete(previous)
  return { musicAssetKey: key, durationSeconds }
}

export async function deleteMusic(projectId: string): Promise<void> {
  const project = await getProjectOr404(projectId)
  const running = await db.assemblyJob.count({ where: { projectId, jobType: 'assembly', status: { in: ['pending', 'running'] } } })
  if (running > 0) {
    throw new AppError('STATE_CONFLICT', 'hay un ensamblaje en curso (no se borra la música mientras corre)', { projectId })
  }
  if (project.musicAssetKey !== null) {
    storage.delete(project.musicAssetKey)
    await db.project.update({
      where: { id: projectId },
      data: { musicAssetKey: null, musicOriginalName: null, musicDurationSeconds: null },
    })
  }
}

export { readUpload }

// ---------------------------------------------------------------- voces

export async function listVoices(searchParams: URLSearchParams, providerParam?: string | null): Promise<Page<VoiceInfo>> {
  // ?provider&limit&cursor (sin sortBy — catálogo por id; cursor = base64url(id))
  const query = parseBasicPageQuery(searchParams)
  const { provider } = await getTTSProvider(providerParam ?? undefined, undefined)
  const page = await provider.listVoices(query.cursor, query.limit)
  // el cursor de voces lo emite el adaptador (base64url(id)); passthrough opaco
  return { items: page.items, nextCursor: page.nextCursor, limit: query.limit }
}

// ---------------------------------------------------------------- salud

export async function healthShallow(): Promise<{ status: string }> {
  return { status: 'ok' }
}

export async function healthDeep(): Promise<{ status: string; checks: Array<{ name: string; ok: boolean; detail?: string }> }> {
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = []
  try {
    await db.$queryRaw`SELECT 1`
    checks.push({ name: 'database', ok: true, detail: 'SQLite operativa' })
  } catch (err) {
    checks.push({ name: 'database', ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
  try {
    const probeKey = 'outputs/.health-probe.tmp'
    storage.save(probeKey, Buffer.from('ok', 'utf8'))
    storage.delete(probeKey)
    checks.push({ name: 'storage', ok: true, detail: `root=${storage.root}` })
  } catch (err) {
    checks.push({ name: 'storage', ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
  try {
    const version = await ffmpegVersion()
    checks.push({ name: 'ffmpeg', ok: true, detail: version })
  } catch (err) {
    checks.push({ name: 'ffmpeg', ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
  try {
    const version = await ffprobeVersion()
    checks.push({ name: 'ffprobe', ok: true, detail: version })
  } catch (err) {
    checks.push({ name: 'ffprobe', ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
  // VoiceStudio (A-05): local en localhost:3900; en este sandbox no corre → check declara su estado real
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    try {
      await fetch('http://localhost:3900/v1/models', { signal: controller.signal })
      checks.push({ name: 'voicestudio', ok: true, detail: 'alcanzable' })
    } finally {
      clearTimeout(timer)
    }
  } catch {
    checks.push({ name: 'voicestudio', ok: false, detail: 'no alcanzable en este entorno (proveedor TTS por defecto: zai)' })
  }
  const missingKeys = await db.providerConfig.findMany({
    where: { providerType: { in: ['video', 'tts', 'llm', 'image'] } },
  })
  const needsKey = missingKeys.filter((row) => {
    const entry = airshotRegistry[row.providerType as keyof typeof airshotRegistry]?.[row.providerName]
    return entry?.auth === 'api_key' && (row.apiKeyEncrypted === null || row.apiKeyEncrypted.length === 0)
  })
  checks.push({
    name: 'provider-configs',
    ok: true,
    detail: needsKey.length === 0 ? 'todas las configs con key' : `sin key: ${needsKey.map((r) => `${r.providerName} [${r.providerType}]`).join(', ')}`,
  })
  try {
    const { statfs } = await import('node:fs/promises')
    const space = await statfs(storage.root)
    const freeBytes = Number(space.bavail) * Number(space.bsize)
    const totalBytes = Number(space.blocks) * Number(space.bsize)
    const gb = (n: number) => (n / 1024 ** 3).toFixed(2)
    checks.push({ name: 'disk', ok: freeBytes > 0, detail: `libre ${gb(freeBytes)} GB de ${gb(totalBytes)} GB en data.root` })
  } catch (err) {
    checks.push({ name: 'disk', ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
  try {
    const [activeJobs, pendingScenes] = await Promise.all([
      db.assemblyJob.count({ where: { status: { in: ['pending', 'running'] } } }),
      db.scene.count({ where: { status: { endsWith: '_pending' } } }),
    ])
    checks.push({ name: 'jobs', ok: true, detail: `${activeJobs} job(s) activos, ${pendingScenes} escena(s) *_pending` })
  } catch (err) {
    checks.push({ name: 'jobs', ok: false, detail: err instanceof Error ? err.message : String(err) })
  }
  return { status: 'ok', checks }
}

// ---------------------------------------------------------------- config runtime

export function runtimeConfig(): Record<string, unknown> {
  // lista cerrada de grupos de límites de negocio (Anexo A) — storage y security EXCLUIDOS
  return {
    app: { batch_max_operations: airshotConfig.app.batch_max_operations },
    pagination: airshotConfig.pagination,
    story: airshotConfig.story,
    scene: airshotConfig.scene,
    scene_reference: airshotConfig.scene_reference,
    reference: airshotConfig.reference,
    visual_style: airshotConfig.visual_style,
    upload: airshotConfig.upload,
    media: airshotConfig.media,
    assembly: {
      require_audio: airshotConfig.assembly.require_audio,
      music_default_volume: airshotConfig.assembly.music_default_volume,
      output_fps: airshotConfig.assembly.output_fps,
    },
    audio_qa: { enabled: airshotConfig.audio_qa.earshot.enabled },
    providers: {
      video: Object.keys(airshotRegistry.video).sort(),
      tts: Object.keys(airshotRegistry.tts).sort(),
      llm: Object.keys(airshotRegistry.llm).sort(),
      image: Object.keys(airshotRegistry.image).sort(),
      audio_qa: Object.keys(airshotRegistry.audio_qa).sort(),
      defaults: airshotConfig.providers,
    },
  }
}
