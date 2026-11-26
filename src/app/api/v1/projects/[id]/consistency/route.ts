// GET /api/v1/projects/{id}/consistency — auditoría de consistencia de personajes y semillas
import { NextRequest } from 'next/server'
import { okJson, withRoute } from '@/lib/airshot/core/http'
import { getConsistency } from '@/lib/airshot/services/consistency'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  return okJson(await getConsistency(id))
})
