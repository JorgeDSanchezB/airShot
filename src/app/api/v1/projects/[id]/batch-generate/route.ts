// POST /api/v1/projects/{id}/batch-generate — encola "Generar todo" (202)
// GET  /api/v1/projects/{id}/batch-generate — último batch del proyecto (o null)
import { NextRequest } from 'next/server'
import { BatchGenerateRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { getProjectOr404 } from '@/lib/airshot/services/projects'
import { latestBatchForProject, startBatch } from '@/lib/airshot/services/batches'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  await getProjectOr404(id)
  const body = await readJsonBody(req, BatchGenerateRequest)
  return okJson(await startBatch(id, body), 202)
})

export const GET = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  await getProjectOr404(id)
  return okJson({ batch: latestBatchForProject(id) })
})
