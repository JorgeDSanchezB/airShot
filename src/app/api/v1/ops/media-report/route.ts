// GET /api/v1/ops/media-report — archivos bajo data.root sin referencia en la BD
import { okJson, withRoute } from '@/lib/airshot/core/http'
import { scanOrphans } from '@/lib/airshot/services/maintenance'

export const dynamic = 'force-dynamic'

export const GET = withRoute(async () => {
  const report = await scanOrphans()
  // la lista completa puede ser enorme; el panel muestra una muestra y los totales
  return okJson({ ...report, orphans: report.orphans.slice(0, 200) })
})
