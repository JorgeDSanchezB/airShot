// POST /api/v1/assemblies/{jobId}/retry — reintenta un job failed creando uno
// nuevo con los mismos parámetros (202 + sondeo; los jobs son inmutables).
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { okJson, withRoute } from '@/lib/airshot/core/http'
import { retryAssemblyJob } from '@/lib/airshot/services/jobs'
import { toAssemblyJobResponse } from '@/lib/airshot/domain/dto'

type Ctx = { params: Promise<{ jobId: string }> }

export const POST = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { jobId } = await params
  const newJobId = await retryAssemblyJob(jobId)
  const job = await db.assemblyJob.findUniqueOrThrow({ where: { id: newJobId } })
  return okJson(toAssemblyJobResponse(job), 202)
})
