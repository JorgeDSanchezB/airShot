// /api/v1/provider-configs/{id} — PATCH (apiKey write-only), DELETE
import { NextRequest } from 'next/server'
import { PatchProviderConfigRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, noContent, withRoute } from '@/lib/airshot/core/http'
import { patchProviderConfig, deleteProviderConfig } from '@/lib/airshot/services/provider-configs'

type Ctx = { params: Promise<{ id: string }> }

export const PATCH = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, PatchProviderConfigRequest)
  return okJson(await patchProviderConfig(id, body))
})

export const DELETE = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  await deleteProviderConfig(id)
  return noContent()
})
