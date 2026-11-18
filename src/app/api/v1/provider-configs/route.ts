// /api/v1/provider-configs — GET (P: ?providerType&limit&cursor&sortBy=createdAt) + POST (upsert 201/200)
import { NextRequest } from 'next/server'
import { UpsertProviderConfigRequest } from '@/lib/airshot/domain/schemas'
import { parseListQuery } from '@/lib/airshot/core/pagination'
import { okJson, readJsonBody, withRoute, StaticRouteCtx } from '@/lib/airshot/core/http'
import { findProviderConfigRow, listProviderConfigs, upsertProviderConfig } from '@/lib/airshot/services/provider-configs'
import { ensureBootstrap } from '@/lib/airshot/infrastructure/bootstrap'

export const dynamic = 'force-dynamic'

export const GET = withRoute<StaticRouteCtx>(async (req: NextRequest) => {
  await ensureBootstrap()
  const query = parseListQuery(req.nextUrl.searchParams, { sortWhitelist: ['createdAt'], defaultSort: 'createdAt' })
  const page = await listProviderConfigs({
    limit: query.limit,
    cursor: query.cursor,
    order: query.order,
    providerType: req.nextUrl.searchParams.get('providerType') ?? undefined,
  })
  return okJson(page)
})

export const POST = withRoute<StaticRouteCtx>(async (req: NextRequest) => {
  await ensureBootstrap()
  const body = await readJsonBody(req, UpsertProviderConfigRequest)
  const existing = await findProviderConfigRow(body.providerType, body.providerName)
  const result = await upsertProviderConfig(body, existing === null)
  return okJson(result, existing === null ? 201 : 200)
})
