// POST /api/v1/scenes/{id}/versions/{versionId}/restore — undo no destructivo
import { NextRequest } from 'next/server'
import { okJson, withRoute } from '@/lib/airshot/core/http'
import { getScene } from '@/lib/airshot/services/scenes'
import { restoreSceneVersion } from '@/lib/airshot/services/versions'

type Ctx = { params: Promise<{ id: string; versionId: string }> }

export const POST = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id, versionId } = await params
  await restoreSceneVersion(id, versionId)
  return okJson(await getScene(id))
})
