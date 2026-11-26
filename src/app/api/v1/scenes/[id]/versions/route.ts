// GET /api/v1/scenes/{id}/versions — historial de assets de la escena
import { NextRequest } from 'next/server'
import { okJson, withRoute } from '@/lib/airshot/core/http'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { listSceneVersions } from '@/lib/airshot/services/versions'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id } = await params
  const items = await listSceneVersions(id)
  return okJson({
    items: items.map((version) => ({
      ...version,
      createdAt: version.createdAt.toISOString(),
      url: storage.resolveUrl(version.storageKey),
    })),
  })
})
