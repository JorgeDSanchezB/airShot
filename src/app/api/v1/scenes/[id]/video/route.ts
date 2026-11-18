// DELETE /api/v1/scenes/{id}/video — descartar clip
import { NextRequest } from 'next/server'
import { noContent, withRoute } from '@/lib/airshot/core/http'
import { deleteSceneAsset } from '@/lib/airshot/services/scenes'

type Ctx = { params: Promise<{ id: string }> }

export const DELETE = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  await deleteSceneAsset(id, 'video')
  return noContent()
})
