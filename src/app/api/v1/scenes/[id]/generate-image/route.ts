// POST /api/v1/scenes/{id}/generate-image — imagen base con IA (síncrono)
import { NextRequest } from 'next/server'
import { GenerateSceneImageRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { generateSceneImage } from '@/lib/airshot/services/scenes'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, GenerateSceneImageRequest)
  return okJson(await generateSceneImage(id, body))
})
