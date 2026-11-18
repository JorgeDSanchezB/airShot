// GET /api/v1/health[?deep=true] — liveness + comprobaciones declaradas por check
import { NextRequest } from 'next/server'
import { healthDeep, healthShallow } from '@/lib/airshot/services/misc'
import { okJson, withRoute, StaticRouteCtx } from '@/lib/airshot/core/http'

export const dynamic = 'force-dynamic'

export const GET = withRoute<StaticRouteCtx>(async (req: NextRequest) => {
  if (req.nextUrl.searchParams.get('deep') === 'true') {
    return okJson(await healthDeep())
  }
  return okJson(await healthShallow())
})
