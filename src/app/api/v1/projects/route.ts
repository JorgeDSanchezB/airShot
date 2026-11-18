// /api/v1/projects — GET (P: ?limit&cursor&status&q&sortBy=createdAt&order) + POST
import { NextRequest } from 'next/server'
import { CreateProjectRequest } from '@/lib/airshot/domain/schemas'
import { parseListQuery } from '@/lib/airshot/core/pagination'
import { okJson, readJsonBody, withRoute, StaticRouteCtx } from '@/lib/airshot/core/http'
import { createProject, listProjects } from '@/lib/airshot/services/projects'
import { ensureBootstrap } from '@/lib/airshot/infrastructure/bootstrap'

export const dynamic = 'force-dynamic'

export const GET = withRoute<StaticRouteCtx>(async (req: NextRequest) => {
  await ensureBootstrap()
  const query = parseListQuery(req.nextUrl.searchParams, { sortWhitelist: ['createdAt'], defaultSort: 'createdAt' })
  const page = await listProjects({
    limit: query.limit,
    cursor: query.cursor,
    order: query.order,
    status: req.nextUrl.searchParams.get('status') ?? undefined,
    q: req.nextUrl.searchParams.get('q') ?? undefined,
  })
  return okJson(page)
})

export const POST = withRoute<StaticRouteCtx>(async (req: NextRequest) => {
  await ensureBootstrap()
  const body = await readJsonBody(req, CreateProjectRequest)
  const project = await createProject(body)
  return okJson(project, 201)
})
