// POST /api/v1/projects/{id}/audio-qa — Earshot opt-in (202 + sondeo); 409 si módulo desactivado
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { AudioQARequest } from '@/lib/airshot/domain/schemas'
import { AppError } from '@/lib/airshot/core/errors'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { createAudioQAJob } from '@/lib/airshot/services/jobs'
import { toAssemblyJobResponse } from '@/lib/airshot/domain/dto'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, AudioQARequest)
  const jobId = await createAudioQAJob(id, body.features, body.generateSfx ?? false)
  const job = await db.assemblyJob.findUniqueOrThrow({ where: { id: jobId } })
  return okJson(toAssemblyJobResponse(job), 202)
})
