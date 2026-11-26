// GET /api/v1/projects/{id}/translations — resumen de idiomas (cobertura de audio)
// POST /api/v1/projects/{id}/translations — traduce las escenas con el LLM
import { NextRequest } from 'next/server'
import { TranslateProjectRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { listLanguages, translateProject } from '@/lib/airshot/services/translations'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  return okJson(await listLanguages(id))
})

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, TranslateProjectRequest)
  return okJson({ results: await translateProject(id, body) }, 201)
})
