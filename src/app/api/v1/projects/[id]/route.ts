// /api/v1/projects/{id} — GET, PATCH (ausente≠nulo), DELETE (proyecto + assets)
import { NextRequest } from 'next/server'
import { PatchProjectRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, noContent, withRoute } from '@/lib/airshot/core/http'
import { deleteProject, getProject, patchProject } from '@/lib/airshot/services/projects'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  return okJson(await getProject(id))
})

export const PATCH = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, PatchProjectRequest)
  return okJson(await patchProject(id, body))
})

export const DELETE = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  await deleteProject(id)
  return noContent()
})
