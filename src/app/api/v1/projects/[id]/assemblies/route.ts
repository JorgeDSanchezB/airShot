// GET /api/v1/projects/{id}/assemblies — P: ?limit&cursor&jobType&sortBy=createdAt
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { AppError } from '@/lib/airshot/core/errors'
import { parseListQuery, buildPage, decodeCursor, seekCreatedAt } from '@/lib/airshot/core/pagination'
import { okJson, withRoute } from '@/lib/airshot/core/http'
import { getProjectOr404 } from '@/lib/airshot/services/projects'
import { toAssemblyJobResponse } from '@/lib/airshot/domain/dto'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  await getProjectOr404(id)
  const query = parseListQuery(req.nextUrl.searchParams, { sortWhitelist: ['createdAt'], defaultSort: 'createdAt' })
  const jobType = req.nextUrl.searchParams.get('jobType') ?? undefined
  if (jobType !== undefined && !['assembly', 'audio_qa'].includes(jobType)) {
    throw new AppError('VALIDATION_ERROR', `jobType="${jobType}" fuera de enum [assembly|audio_qa]`, { field: 'jobType' })
  }
  const where: Prisma.AssemblyJobWhereInput = { projectId: id }
  if (jobType !== undefined) where.jobType = jobType
  if (query.cursor !== null) {
    const dec = decodeCursor(query.cursor)
    Object.assign(where, seekCreatedAt(query.order, String(dec.v), dec.i ?? ''))
  }
  const rows = await db.assemblyJob.findMany({
    where,
    orderBy: [{ createdAt: query.order }, { id: query.order }],
    take: query.limit + 1,
  })
  const items = rows.map(toAssemblyJobResponse)
  const page = buildPage(items, query.limit, (job) => ({ v: job.createdAt, i: job.id }))
  return okJson(page)
})
