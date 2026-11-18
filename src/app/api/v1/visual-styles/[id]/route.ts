// /api/v1/visual-styles/{id} — PATCH, DELETE (409 DELETION_FORBIDDEN en seeds)
import { NextRequest } from 'next/server'
import { PatchVisualStyleRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, noContent, withRoute } from '@/lib/airshot/core/http'
import { patchStyle, deleteStyle } from '@/lib/airshot/services/styles'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, PatchVisualStyleRequest)
  return okJson(await patchStyle(id, body))
})

export const DELETE = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  await deleteStyle(id)
  return noContent()
})
