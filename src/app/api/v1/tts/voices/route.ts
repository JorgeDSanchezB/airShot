// GET /api/v1/tts/voices — P: ?provider&limit&cursor (voces del proveedor TTS)
import { NextRequest } from 'next/server'
import { okJson, withRoute, StaticRouteCtx } from '@/lib/airshot/core/http'
import { listVoices } from '@/lib/airshot/services/misc'
import { ensureBootstrap } from '@/lib/airshot/infrastructure/bootstrap'

export const dynamic = 'force-dynamic'

export const GET = withRoute<StaticRouteCtx>(async (req: NextRequest) => {
  await ensureBootstrap()
  const page = await listVoices(req.nextUrl.searchParams, req.nextUrl.searchParams.get('provider'))
  return okJson(page)
})
