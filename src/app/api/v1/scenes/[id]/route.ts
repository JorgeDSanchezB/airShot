// /api/v1/scenes/{id} — GET (incluye assets + lastError), PATCH, DELETE
import { NextRequest } from 'next/server'
import { PatchSceneRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, noContent, withRoute } from '@/lib/airshot/core/http'
import { getScene, patchScene, deleteScene } from '@/lib/airshot/services/scenes'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  return okJson(await getScene(id))
})

export const PATCH = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, PatchSceneRequest)
  return okJson(await patchScene(id, body))
})

export const DELETE = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  await deleteScene(id)
  return noContent()
})
