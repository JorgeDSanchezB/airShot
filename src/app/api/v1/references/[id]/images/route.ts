// POST /api/v1/references/{id}/images — subir imagen de referencia (multipart)
import { NextRequest } from 'next/server'
import { okJson, withRoute } from '@/lib/airshot/core/http'
import { readUpload } from '@/lib/airshot/services/uploads'
import { uploadReferenceImage } from '@/lib/airshot/services/references'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const file = await readUpload(req, 'image')
  return okJson(await uploadReferenceImage(id, file))
})
