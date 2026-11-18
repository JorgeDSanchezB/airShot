// AirShot — services/uploads.ts (§3.5)
// Subidas multipart: tope de bytes (413), whitelist de MIME (415) y verificación
// de magic bytes (415 si el contenido no coincide con el MIME declarado).
// Las claves de storage las genera el servidor; nunca se aceptan nombres de cliente.

import { NextRequest } from 'next/server'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AppError } from '@/lib/airshot/core/errors'

export type UploadKind = 'image' | 'music'

export type UploadedFile = { buffer: Buffer; mime: string; ext: string }

const MAGIC: Record<string, Array<(b: Buffer) => boolean>> = {
  'image/png': [(b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  'image/jpeg': [(b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))],
  'image/webp': [(b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP'],
  'audio/mpeg': [
    (b) => b.subarray(0, 3).toString('ascii') === 'ID3',
    (b) => b.length > 1 && b[0] === 0xff && (b[1] === 0xfb || b[1] === 0xf3 || b[1] === 0xe3 || b[1] === 0xf2 || b[1] === 0xf6),
  ],
  'audio/wav': [(b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WAVE'],
  'audio/ogg': [(b) => b.subarray(0, 4).toString('ascii') === 'OggS'],
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
}

export async function readUpload(req: NextRequest, kind: UploadKind, fieldName = 'file'): Promise<UploadedFile> {
  const limits = airshotConfig.upload[kind]
  const contentLength = Number(req.headers.get('content-length') ?? '0')
  if (contentLength > airshotConfig.app.max_body_bytes) {
    throw new AppError('PAYLOAD_TOO_LARGE', `multipart de ${contentLength} bytes supera app.max_body_bytes`)
  }
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new AppError('VALIDATION_ERROR', 'multipart malformado')
  }
  const file = form.get(fieldName)
  if (!(file instanceof File)) {
    throw new AppError('VALIDATION_ERROR', `campo de subida "${fieldName}" ausente o no es archivo`, { field: fieldName })
  }
  if (file.size > limits.max_bytes) {
    throw new AppError('PAYLOAD_TOO_LARGE', `archivo de ${file.size} bytes supera upload.${kind}.max_bytes=${limits.max_bytes}`)
  }
  const mime = file.type.length > 0 ? file.type : sniffMime(file)
  if (!limits.allowed_mime.includes(mime)) {
    throw new AppError('UNSUPPORTED_MEDIA', `MIME "${mime}" fuera de whitelist upload.${kind}.allowed_mime [${limits.allowed_mime.join(', ')}]`)
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  const checks = MAGIC[mime] ?? []
  if (checks.length > 0 && !checks.some((check) => check(buffer))) {
    throw new AppError('UNSUPPORTED_MEDIA', 'magic bytes no coinciden con el MIME declarado')
  }
  const ext = EXT_BY_MIME[mime] ?? 'bin'
  return { buffer, mime, ext }
}

function sniffMime(file: File): string {
  const name = file.name.toLowerCase()
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.mp3')) return 'audio/mpeg'
  if (name.endsWith('.wav')) return 'audio/wav'
  if (name.endsWith('.ogg')) return 'audio/ogg'
  return 'application/octet-stream'
}
