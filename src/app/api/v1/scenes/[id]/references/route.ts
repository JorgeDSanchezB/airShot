// PUT /api/v1/scenes/{id}/references — sustituir asignaciones (límites scene_reference.*)
import { NextRequest } from 'next/server'
import { SceneReferencesPutRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { putSceneReferences } from '@/lib/airshot/services/scenes'

type Ctx = { params: Promise<{ id: string }> }

export const PUT = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, SceneReferencesPutRequest)
  return okJson(await putSceneReferences(id, body))
})
