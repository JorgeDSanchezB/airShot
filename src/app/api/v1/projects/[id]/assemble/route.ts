// POST /api/v1/projects/{id}/assemble — ensamblaje async (202 + sondeo)
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { AssembleRequest } from '@/lib/airshot/domain/schemas'
import { AppError } from '@/lib/airshot/core/errors'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { createAssemblyJob } from '@/lib/airshot/services/jobs'
import { toAssemblyJobResponse } from '@/lib/airshot/domain/dto'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, AssembleRequest)
  const project = await db.project.findUnique({ where: { id } })
  if (project === null) throw new AppError('NOT_FOUND', `proyecto ${id} no encontrado`, { projectId: id })
  const includeAudio = body.includeAudio ?? true
  const musicVolume = body.musicVolume ?? project.musicVolume ?? airshotConfig.assembly.music_default_volume
  const jobId = await createAssemblyJob(id, { includeAudio, musicVolume })
  const job = await db.assemblyJob.findUniqueOrThrow({ where: { id: jobId } })
  return okJson(toAssemblyJobResponse(job), 202)
})
