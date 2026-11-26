// /api/v1/batches/{batchId} — GET estado + PATCH {action: pause|resume|cancel}
import { NextRequest } from 'next/server'
import { BatchControlRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { controlBatch, getBatchOr404 } from '@/lib/airshot/services/batches'

type Ctx = { params: Promise<{ batchId: string }> }

export const GET = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { batchId } = await params
  return okJson(getBatchOr404(batchId))
})

export const PATCH = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { batchId } = await params
  const body = await readJsonBody(req, BatchControlRequest)
  return okJson(controlBatch(batchId, body.action))
})
