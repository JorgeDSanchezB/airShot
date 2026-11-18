// GET /api/v1/assemblies/{jobId} — sondeo de job individual (ensamblaje o audio-qa)
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { AppError } from '@/lib/airshot/core/errors'
import { okJson, withRoute } from '@/lib/airshot/core/http'
import { toAssemblyJobResponse } from '@/lib/airshot/domain/dto'

type Ctx = { params: Promise<{ jobId: string }> }

export const GET = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { jobId } = await params
  const row = await db.assemblyJob.findUnique({ where: { id: jobId } })
  if (row === null) throw new AppError('NOT_FOUND', `job ${jobId} no encontrado`, { jobId })
  return okJson(toAssemblyJobResponse(row))
})
