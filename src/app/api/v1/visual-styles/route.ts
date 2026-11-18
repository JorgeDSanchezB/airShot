// /api/v1/visual-styles — GET (P: ?origin&limit&cursor&sortBy=createdAt) + POST
import { NextRequest } from 'next/server'
import { CreateVisualStyleRequest } from '@/lib/airshot/domain/schemas'
import { parseListQuery } from '@/lib/airshot/core/pagination'
import { okJson, readJsonBody, withRoute, StaticRouteCtx } from '@/lib/airshot/core/http'
import { createStyle, listStyles } from '@/lib/airshot/services/styles'
import { ensureBootstrap } from '@/lib/airshot/infrastructure/bootstrap'

export const dynamic = 'force-dynamic'

export const GET = withRoute<StaticRouteCtx>(async (req: NextRequest) => {
  await ensureBootstrap()
  const query = parseListQuery(req.nextUrl.searchParams, { sortWhitelist: ['createdAt'], defaultSort: 'createdAt' })
  const page = await listStyles({
    limit: query.limit,
    cursor: query.cursor,
    order: query.order,
    origin: req.nextUrl.searchParams.get('origin') ?? undefined,
  })
  return okJson(page)
})

export const POST = withRoute<StaticRouteCtx>(async (req: NextRequest) => {
  await ensureBootstrap()
  const body = await readJsonBody(req, CreateVisualStyleRequest)
  return okJson(await createStyle(body), 201)
})
