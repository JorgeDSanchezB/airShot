// /api/v1/references — GET (P: ?scope&projectId&type&level&q&limit&cursor&sortBy=createdAt&order) + POST
import { NextRequest } from 'next/server'
import { CreateReferenceRequest } from '@/lib/airshot/domain/schemas'
import { AppError } from '@/lib/airshot/core/errors'
import { parseListQuery } from '@/lib/airshot/core/pagination'
import { okJson, readJsonBody, withRoute, StaticRouteCtx } from '@/lib/airshot/core/http'
import { createReference, listReferences } from '@/lib/airshot/services/references'
import { ensureBootstrap } from '@/lib/airshot/infrastructure/bootstrap'

export const dynamic = 'force-dynamic'

export const GET = withRoute<StaticRouteCtx>(async (req: NextRequest) => {
  await ensureBootstrap()
  const query = parseListQuery(req.nextUrl.searchParams, { sortWhitelist: ['createdAt'], defaultSort: 'createdAt' })
  const scope = req.nextUrl.searchParams.get('scope')
  if (scope !== null && scope !== 'global' && scope !== 'project') {
    throw new AppError('VALIDATION_ERROR', `scope="${scope}" fuera de whitelist [global|project]`, { field: 'scope' })
  }
  const page = await listReferences({
    limit: query.limit,
    cursor: query.cursor,
    order: query.order,
    scope: (scope ?? undefined) as 'global' | 'project' | undefined,
    projectId: req.nextUrl.searchParams.get('projectId') ?? undefined,
    type: req.nextUrl.searchParams.get('type') ?? undefined,
    level: req.nextUrl.searchParams.get('level') ?? undefined,
    q: req.nextUrl.searchParams.get('q') ?? undefined,
  })
  return okJson(page)
})

export const POST = withRoute<StaticRouteCtx>(async (req: NextRequest) => {
  await ensureBootstrap()
  const body = await readJsonBody(req, CreateReferenceRequest)
  return okJson(await createReference(body), 201)
})
