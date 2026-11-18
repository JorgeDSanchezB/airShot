// PUT /api/v1/projects/{id}/scenes/order — reordenar (lista completa, set exacto)
import { NextRequest } from 'next/server'
import { ReorderScenesRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { reorderScenes } from '@/lib/airshot/services/scenes'

type Ctx = { params: Promise<{ id: string }> }

export const PUT = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, ReorderScenesRequest)
  return okJson({ scenes: await reorderScenes(id, body) })
})
