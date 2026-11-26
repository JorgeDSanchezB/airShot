// POST /api/v1/projects/{id}/export — proyecto portable .airshot (project.json + media opcional)
import { NextRequest } from 'next/server'
import { ExportProjectRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { exportProject } from '@/lib/airshot/services/transfer'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, ExportProjectRequest)
  return okJson(await exportProject(id, body), 201)
})
