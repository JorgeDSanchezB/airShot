// DELETE /api/v1/projects/{id}/translations/{language} — borra textos y audios
import { NextRequest } from 'next/server'
import { okJson, withRoute } from '@/lib/airshot/core/http'
import { deleteLanguage } from '@/lib/airshot/services/translations'

type Ctx = { params: Promise<{ id: string; language: string }> }

export const DELETE = withRoute<Ctx>(async (_req: NextRequest, { params }) => {
  const { id, language } = await params
  return okJson(await deleteLanguage(id, language))
})
