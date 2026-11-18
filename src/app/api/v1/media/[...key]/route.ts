// GET /api/v1/media/[...key] — serve de assets bajo data.root con contención de rutas
// y Cache-Control: private, max-age=media.cache_max_age_seconds (§3.5 / §Media)
import { NextRequest, NextResponse } from 'next/server'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { withRoute } from '@/lib/airshot/core/http'

type Ctx = { params: Promise<{ key: string[] }> }

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  json: 'application/json',
}

export const GET = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { key } = await params
  const storageKey = key.map((segment) => decodeURIComponent(segment)).join('/')
  if (!storage.exists(storageKey)) {
    throw new AppError('NOT_FOUND', `asset "${storageKey}" no encontrado`)
  }
  let bytes: Buffer
  try {
    bytes = storage.open(storageKey)
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError('NOT_FOUND', `asset "${storageKey}" ilegible`)
  }
  const ext = storageKey.split('.').pop()?.toLowerCase() ?? ''
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'content-type': contentType,
      'content-length': String(bytes.byteLength),
      'cache-control': `private, max-age=${airshotConfig.media.cache_max_age_seconds}`,
    },
  })
})
