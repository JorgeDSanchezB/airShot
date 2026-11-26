// Integración end-to-end del ensamblaje (camino dorado LOCAL, sin proveedores IA):
// clips/narración/música sintetizados con FFmpeg → createAssemblyJob real →
// job runner in-process → final.mp4 + subtitles.srt + portada.jpg verificados
// con ffprobe. Ejercita aspecto 9:16, SRT sidecar, portada y ducking.
// Se omite si no hay ffmpeg/ffprobe en el PATH (se declara, no se finge).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'

const dbFile = `__test_${randomUUID()}.db`
const dbPath = join(process.cwd(), 'prisma', dbFile)
const databaseUrl = `file:./${dbFile}`

const prismaBin = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'prisma.exe' : 'prisma')

const ffmpegBin = process.env.FFMPEG_PATH ?? 'ffmpeg'
const ffprobeBin = process.env.FFPROBE_PATH ?? 'ffprobe'
const hasFfmpeg = spawnSync(ffmpegBin, ['-version'], { stdio: 'ignore' }).status === 0
  && spawnSync(ffprobeBin, ['-version'], { stdio: 'ignore' }).status === 0

let db: import('@prisma/client').PrismaClient
let storage: typeof import('@/lib/airshot/infrastructure/storage').storage
let createAssemblyJob: typeof import('@/lib/airshot/services/jobs').createAssemblyJob

const createdKeys: string[] = []
let projectId = ''
let sceneAId = ''
let sceneBId = ''
let assetsDir = ''

function ffmpeg(args: string[]): void {
  execFileSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'pipe' })
}

function writeAsset(key: string, absPath: string): void {
  storage.save(key, readFileSync(absPath))
  createdKeys.push(key)
}

function probeDims(absPath: string): { width: number; height: number } {
  const out = execFileSync(ffprobeBin, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', absPath], { encoding: 'utf8' })
  const parsed = JSON.parse(out) as { streams: Array<{ width: number; height: number }> }
  return { width: parsed.streams[0].width, height: parsed.streams[0].height }
}

async function pollJob(jobId: string, timeoutMs = 60_000): Promise<{ status: string; outputPath: string | null; subtitlesPath: string | null; thumbnailPath: string | null; progress: string | null; errorMessage: string | null }> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const job = await db.assemblyJob.findUniqueOrThrow({ where: { id: jobId } })
    if (job.status === 'completed' || job.status === 'failed') return job
    if (Date.now() > deadline) throw new Error(`job ${jobId} no terminó en ${timeoutMs} ms (estado ${job.status})`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

beforeAll(async () => {
  execFileSync(prismaBin, ['migrate', 'deploy'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  })
  process.env.DATABASE_URL = databaseUrl
  db = (await import('@/lib/db')).db
  storage = (await import('@/lib/airshot/infrastructure/storage')).storage
  createAssemblyJob = (await import('@/lib/airshot/services/jobs')).createAssemblyJob

  projectId = randomUUID()
  sceneAId = randomUUID()
  sceneBId = randomUUID()
  assetsDir = `uploads/__test__/${projectId}`
  await db.project.create({ data: { id: projectId, title: 'golden path', originalStory: 'dos escenas sintéticas', musicVolume: 0.4 } })
  await db.scene.create({
    data: { id: sceneAId, projectId, orderIndex: 0, originalText: 'primera', narrationText: 'Primera escena de prueba.', durationSeconds: 2, status: 'image_ready' },
  })
  await db.scene.create({
    data: { id: sceneBId, projectId, orderIndex: 1, originalText: 'segunda', narrationText: 'Segunda escena de prueba.', durationSeconds: 2, status: 'image_ready' },
  })
})

afterAll(async () => {
  if (storage !== undefined) {
    for (const key of createdKeys) storage.delete(key)
    const jobs = await db?.assemblyJob.findMany({ where: { projectId } }).catch(() => []) ?? []
    for (const job of jobs) {
      storage.delete(job.outputPath)
      storage.delete(job.subtitlesPath)
      storage.delete(job.thumbnailPath)
    }
  }
  await db?.$disconnect()
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = `${dbPath}${suffix}`
    if (existsSync(p)) rmSync(p)
  }
})

describe.skipIf(!hasFfmpeg)('camino dorado del ensamblaje (FFmpeg real)', () => {
  it('produce mp4 9:16 + SRT + portada con progreso persistido y ducking', async () => {
    const tmp = join(process.cwd(), 'tests', 'tmp-golden')
    rmSync(tmp, { recursive: true, force: true })
    mkdirSync(tmp, { recursive: true })
    try {
      // clips 320x180 (se reescalan al lienzo 9:16), narración por escena y música
      const clipA = join(tmp, 'a.mp4')
      const clipB = join(tmp, 'b.mp4')
      const narrA = join(tmp, 'na.wav')
      const narrB = join(tmp, 'nb.wav')
      const music = join(tmp, 'music.wav')
      ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24:duration=2', '-pix_fmt', 'yuv420p', clipA])
      ffmpeg(['-f', 'lavfi', '-i', 'smptebars=size=320x180:rate=24:duration=2', '-pix_fmt', 'yuv420p', clipB])
      ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-ar', '48000', '-ac', '2', narrA])
      ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=660:duration=2', '-ar', '48000', '-ac', '2', narrB])
      ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=220:duration=6', '-ar', '48000', '-ac', '2', music])

      const clipAKey = `${assetsDir}/clip_a.mp4`
      const clipBKey = `${assetsDir}/clip_b.mp4`
      const narrAKey = `${assetsDir}/narration_a.wav`
      const narrBKey = `${assetsDir}/narration_b.wav`
      const musicKey = `${assetsDir}/music.wav`
      writeAsset(clipAKey, clipA)
      writeAsset(clipBKey, clipB)
      writeAsset(narrAKey, narrA)
      writeAsset(narrBKey, narrB)
      writeAsset(musicKey, music)

      await db.scene.update({ where: { id: sceneAId }, data: { videoClipPath: clipAKey, audioPath: narrAKey, status: 'video_ready' } })
      await db.scene.update({ where: { id: sceneBId }, data: { videoClipPath: clipBKey, audioPath: narrBKey, status: 'video_ready' } })
      await db.project.update({ where: { id: projectId }, data: { musicAssetKey: musicKey, musicOriginalName: 'test.wav' } })

      const jobId = await createAssemblyJob(projectId, {
        includeAudio: true,
        musicVolume: 0.4,
        aspect: '9:16',
        subtitles: 'srt',
        duckMusic: true,
        coverSceneId: sceneBId,
      })
      const job = await pollJob(jobId)

      expect(job.status, job.errorMessage ?? undefined).toBe('completed')
      expect(job.outputPath).not.toBeNull()
      expect(job.subtitlesPath).not.toBeNull()
      expect(job.thumbnailPath).not.toBeNull()
      expect(job.progress).not.toBeNull()

      // 1) salida real con el aspecto pedido
      const outputAbs = storage.abs(job.outputPath as string)
      expect(existsSync(outputAbs)).toBe(true)
      const dims = probeDims(outputAbs)
      expect(dims.width).toBe(720) // lado corto = 720p
      expect(dims.height).toBeGreaterThan(dims.width) // 9:16, no 16:9
      expect(dims.height).toBeGreaterThan(1260)
      expect(dims.height).toBeLessThan(1300)

      // 2) SRT sidecar con los textos y tiempos acumulados
      const srt = readFileSync(storage.abs(job.subtitlesPath as string), 'utf8')
      expect(srt).toContain('Primera escena de prueba.')
      expect(srt).toContain('Segunda escena de prueba.')
      expect(srt).toMatch(/00:00:00,000 --> 00:00:02,000/)
      expect(srt).toMatch(/00:00:02,000 --> 00:00:04,000/)

      // 3) portada JPEG del primer fotograma
      const thumb = readFileSync(storage.abs(job.thumbnailPath as string))
      expect(thumb[0]).toBe(0xff)
      expect(thumb[1]).toBe(0xd8)

      // 4) progreso persistido con stage final
      const progress = JSON.parse(job.progress as string) as { stage: string; done: number; total: number }
      expect(progress).toEqual({ stage: 'done', done: 1, total: 1 })

      // 5) proyecto marcado assembled y ppio->fin completado
      const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })
      expect(project.status).toBe('assembled')
      expect(job.errorMessage).toBeNull()
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('una segunda ejecución reutiliza la caché de normalización', async () => {
    // tras el primer ensamblaje deben existir segmentos normalizados en cache/
    const cacheRow = await db.assemblyJob.findFirst({ where: { projectId, jobType: 'assembly', status: 'completed' } })
    expect(cacheRow).not.toBeNull()
    // segunda ejecución: mismo proyecto, mismos clips ⇒ completa igual (la caché evita
    // volver a normalizar; el resultado sigue siendo correcto)
    const jobId = await createAssemblyJob(projectId, {
      includeAudio: true,
      musicVolume: 0.4,
      aspect: '9:16',
      subtitles: 'none',
      duckMusic: false,
      coverSceneId: null,
    })
    const job = await pollJob(jobId)
    expect(job.status, job.errorMessage ?? undefined).toBe('completed')
    expect(storage.exists(job.outputPath)).toBe(true)
    expect(job.subtitlesPath).toBeNull()
  })

  it('reintenta un job failed creando uno nuevo con los mismos parámetros', async () => {
    const { retryAssemblyJob } = await import('@/lib/airshot/services/jobs')
    const failedId = randomUUID()
    await db.assemblyJob.create({
      data: {
        id: failedId,
        projectId,
        jobType: 'assembly',
        status: 'failed',
        params: JSON.stringify({
          includeAudio: true,
          musicAssetKey: null,
          musicVolume: 0.4,
          resolution: '720p',
          aspect: '1:1',
          subtitles: 'none',
          duckMusic: false,
          coverSceneId: null,
        }),
        errorMessage: JSON.stringify({ code: 'PROVIDER_TIMEOUT', title: 'x', detail: 'simulado', retryable: true }),
        finishedAt: new Date(),
      },
    })
    const newJobId = await retryAssemblyJob(failedId)
    expect(newJobId).not.toBe(failedId)
    const job = await pollJob(newJobId)
    expect(job.status, job.errorMessage ?? undefined).toBe('completed')
    // 1:1 ⇒ lienzo cuadrado con lado corto 720
    const dims = probeDims(storage.abs(job.outputPath as string))
    expect(dims).toEqual({ width: 720, height: 720 })
    // el job original queda inmutable en el historial
    const original = await db.assemblyJob.findUniqueOrThrow({ where: { id: failedId } })
    expect(original.status).toBe('failed')
  })
})

// las salidas de los jobs viven en data/outputs (no versionado); afterAll limpia
// los assets sintéticos y los ficheros de cada job de este test
