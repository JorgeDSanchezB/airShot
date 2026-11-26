// POST /api/v1/projects/import — crea un proyecto desde un archivo .airshot
import { NextRequest } from 'next/server'
import { okJson, withRoute } from '@/lib/airshot/core/http'
import { importProject } from '@/lib/airshot/services/transfer'
import { readArchive } from '@/lib/airshot/services/uploads'

export const POST = withRoute(async (req: NextRequest) => {
  const archive = await readArchive(req)
  return okJson(await importProject(archive), 201)
})
