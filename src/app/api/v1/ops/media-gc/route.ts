// POST /api/v1/ops/media-gc — borra media huérfana (apply=false = simulación)
import { NextRequest } from 'next/server'
import { MediaGcRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { gcOrphans } from '@/lib/airshot/services/maintenance'

export const POST = withRoute(async (req: NextRequest) => {
  const body = await readJsonBody(req, MediaGcRequest)
  const result = await gcOrphans(body.apply)
  return okJson({ ...result, orphans: result.orphans.slice(0, 200) })
})
