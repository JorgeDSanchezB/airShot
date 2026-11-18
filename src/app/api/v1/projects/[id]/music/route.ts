// /api/v1/projects/{id}/music — POST (multipart; sustituye) + DELETE
import { NextRequest } from 'next/server'
import { okJson, noContent, withRoute } from '@/lib/airshot/core/http'
import { deleteMusic, readUpload, uploadMusic } from '@/lib/airshot/services/misc'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const file = await readUpload(req, 'music')
  // m9 (ronda de corrección): el nombre original viaja percent-encoded en la cabecera
  let originalName = file.mime
  const rawName = req.headers.get('x-file-name')
  if (rawName !== null && rawName.length > 0) {
    try {
      originalName = decodeURIComponent(rawName)
    } catch {
      originalName = rawName
    }
  }
  const result = await uploadMusic(id, { buffer: file.buffer, ext: file.ext, originalName })
  return okJson(result)
})

export const DELETE = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  await deleteMusic(id)
  return noContent()
})
