// GET /api/v1/media/[...key] — entrega de assets bajo data.root con contención de rutas.
// Streaming por rangos (206/416) + ETag/304 + ?download=1 (attachment).
// Cache-Control: private, max-age=media.cache_max_age_seconds (§3.5 / §Media).

import { basename } from 'node:path'
import { Readable } from 'node:stream'
import { NextRequest, NextResponse } from 'next/server'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'
import { withRoute } from '@/lib/airshot/core/http'
import { etagMatches, makeEtag, parseRange } from '@/lib/airshot/core/range'

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

function safeFilename(storageKey: string): string {
  const name = basename(storageKey).replace(/[^A-Za-z0-9._-]/g, '_')
  return name.length > 0 ? name : 'asset'
}

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { key } = await params
  const storageKey = key.map((segment) => decodeURIComponent(segment)).join('/')
  if (!storage.exists(storageKey)) {
    throw new AppError('NOT_FOUND', `asset "${storageKey}" no encontrado`)
  }

  let stat
  try {
    stat = storage.stat(storageKey)
  } catch {
    throw new AppError('NOT_FOUND', `asset "${storageKey}" ilegible`)
  }

  const ext = storageKey.split('.').pop()?.toLowerCase() ?? ''
  const etag = makeEtag(stat.size, stat.mtimeMs)
  const headers = new Headers({
    'content-type': CONTENT_TYPES[ext] ?? 'application/octet-stream',
    'cache-control': `private, max-age=${airshotConfig.media.cache_max_age_seconds}`,
    'accept-ranges': 'bytes',
    etag,
    'last-modified': stat.mtime.toUTCString(),
  })

  if (etagMatches(req.headers.get('if-none-match'), etag)) {
    return new NextResponse(null, { status: 304, headers })
  }

  if (req.nextUrl.searchParams.has('download')) {
    headers.set('content-disposition', `attachment; filename="${safeFilename(storageKey)}"`)
  }

  const range = parseRange(req.headers.get('range'), stat.size)
  if (range === 'unsatisfiable') {
    headers.set('content-range', `bytes */${stat.size}`)
    return new NextResponse(null, { status: 416, headers })
  }
  if (stat.size === 0) {
    headers.set('content-length', '0')
    return new NextResponse(null, { status: 200, headers })
  }

  const start = range === null ? 0 : range.start
  const end = range === null ? stat.size - 1 : range.end
  headers.set('content-length', String(end - start + 1))
  if (range !== null) {
    headers.set('content-range', `bytes ${start}-${end}/${stat.size}`)
  }

  const body = Readable.toWeb(storage.createReadStream(storageKey, { start, end })) as ReadableStream
  return new Response(body, { status: range === null ? 200 : 206, headers })
})
