// /api/v1/scenes/{id}/image — POST (multipart, sustituye) + DELETE (descarta asset)
import { NextRequest } from 'next/server'
import { okJson, noContent, withRoute } from '@/lib/airshot/core/http'
import { readUpload } from '@/lib/airshot/services/uploads'
import { deleteSceneAsset, uploadSceneImage } from '@/lib/airshot/services/scenes'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const file = await readUpload(req, 'image')
  return okJson(await uploadSceneImage(id, file))
})

export const DELETE = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  await deleteSceneAsset(id, 'image')
  return noContent()
})
