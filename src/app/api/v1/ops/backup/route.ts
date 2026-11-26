// POST /api/v1/ops/backup — respaldo consistente de la BD SQLite (VACUUM INTO)
import { okJson, withRoute } from '@/lib/airshot/core/http'
import { backupDatabase } from '@/lib/airshot/services/maintenance'

export const POST = withRoute(async () => {
  return okJson(await backupDatabase(), 201)
})
