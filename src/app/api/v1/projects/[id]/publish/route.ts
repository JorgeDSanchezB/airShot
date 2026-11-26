// POST /api/v1/projects/{id}/publish — paquete de publicación (zip con vídeos, SRT, portada, manifiesto)
import { NextRequest } from 'next/server'
import { PublishRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { buildPublishPackage } from '@/lib/airshot/services/publish'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, PublishRequest)
  return okJson(await buildPublishPackage(id, body), 201)
})
