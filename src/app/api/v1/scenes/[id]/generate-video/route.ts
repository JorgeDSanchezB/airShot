// POST /api/v1/scenes/{id}/generate-video — clip con proveedor de vídeo (async, 202)
import { NextRequest } from 'next/server'
import { GenerateSceneVideoRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { generateSceneVideo } from '@/lib/airshot/services/scenes'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, GenerateSceneVideoRequest)
  const scene = await generateSceneVideo(id, body)
  return okJson(scene, 202)
})
