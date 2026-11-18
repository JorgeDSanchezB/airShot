// GET /api/v1/config — límites y defaults efectivos (grupos cerrados del Anexo A;
// storage y security excluidos por decisión del árbitro)
import { runtimeConfig } from '@/lib/airshot/services/misc'
import { okJson, withRoute, StaticRouteCtx } from '@/lib/airshot/core/http'
import { ensureBootstrap } from '@/lib/airshot/infrastructure/bootstrap'

export const dynamic = 'force-dynamic'

export const GET = withRoute<StaticRouteCtx>(async () => {
  await ensureBootstrap()
  return okJson(runtimeConfig())
})
