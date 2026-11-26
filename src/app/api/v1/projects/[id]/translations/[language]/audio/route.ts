// POST /api/v1/projects/{id}/translations/{language}/audio — TTS del idioma
import { NextRequest } from 'next/server'
import { GenerateLanguageAudioRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { generateLanguageAudio } from '@/lib/airshot/services/translations'

type Ctx = { params: Promise<{ id: string; language: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id, language } = await params
  const body = await readJsonBody(req, GenerateLanguageAudioRequest)
  return okJson(await generateLanguageAudio(id, language, body))
})
