// /api/v1/references/{id} — GET, PATCH (attributes sustituye completo), DELETE
import { NextRequest } from 'next/server'
import { PatchReferenceRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, noContent, withRoute } from '@/lib/airshot/core/http'
import { getReference, patchReference, deleteReference } from '@/lib/airshot/services/references'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  return okJson(await getReference(id))
})

export const PATCH = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, PatchReferenceRequest)
  return okJson(await patchReference(id, body))
})

export const DELETE = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  await deleteReference(id)
  return noContent()
})
