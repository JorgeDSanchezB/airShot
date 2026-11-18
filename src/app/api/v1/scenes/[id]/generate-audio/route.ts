// POST /api/v1/scenes/{id}/generate-audio — narración TTS (síncrono)
import { NextRequest } from 'next/server'
import { GenerateSceneAudioRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { generateSceneAudio } from '@/lib/airshot/services/scenes'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, GenerateSceneAudioRequest)
  return okJson(await generateSceneAudio(id, body))
})
