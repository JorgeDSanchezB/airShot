// POST /api/v1/projects/{id}/storyboard — mejora + split en escenas + prompts EN (síncrono)
import { NextRequest } from 'next/server'
import { StoryboardRequest } from '@/lib/airshot/domain/schemas'
import { okJson, readJsonBody, withRoute } from '@/lib/airshot/core/http'
import { generateStoryboard } from '@/lib/airshot/services/storyboard'

type Ctx = { params: Promise<{ id: string }> }

export const POST = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  const { id } = await params
  const body = await readJsonBody(req, StoryboardRequest)
  const result = await generateStoryboard(id, body)
  return okJson(result)
})
