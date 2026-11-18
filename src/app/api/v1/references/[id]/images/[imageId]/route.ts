// /api/v1/references/{id}/images/{imageId} — PATCH (isPrimary=true) + DELETE
import { NextRequest } from 'next/server'
import { ReferenceImagePrimaryRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, noContent, withRoute } from '@/lib/airshot/core/http'
import { deleteReferenceImage, setPrimaryReferenceImage } from '@/lib/airshot/services/references'

type Ctx = { params: Promise<{ id: string; imageId: string }> }

export const PATCH = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id, imageId } = await params
  const body = await readJsonBody(req, ReferenceImagePrimaryRequest)
  return okJson(await setPrimaryReferenceImage(id, imageId, body.isPrimary))
})

export const DELETE = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id, imageId } = await params
  await deleteReferenceImage(id, imageId)
  return noContent()
})
