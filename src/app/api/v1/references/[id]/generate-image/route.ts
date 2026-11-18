// POST /api/v1/references/{id}/generate-image — imagen de referencia con IA
import { NextRequest } from 'next/server'
import { GenerateReferenceImageRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { generateReferenceImage } from '@/lib/airshot/services/references'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, GenerateReferenceImageRequest)
  return okJson(await generateReferenceImage(id, body.styleId))
})
