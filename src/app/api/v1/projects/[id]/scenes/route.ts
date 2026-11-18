// GET /api/v1/projects/{id}/scenes — P: ?limit&cursor&status&sortBy=order|createdAt&order
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { AppError } from '@/lib/airshot/core/errors'
import { parseListQuery, buildPage, decodeCursor, seekCreatedAt, seekOrderIndex } from '@/lib/airshot/core/pagination'
import { okJson, withRoute } from '@/lib/airshot/core/http'
import { getProjectOr404 } from '@/lib/airshot/services/projects'
import { referenceDtos } from '@/lib/airshot/services/scenes'
import { toSceneResponse } from '@/lib/airshot/domain/dto'
import { ensureBootstrap } from '@/lib/airshot/infrastructure/bootstrap'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withRoute<Ctx>(async (req: NextRequest, { params }) => {
  await ensureBootstrap()
  const { id } = await params
  await getProjectOr404(id)
  const query = parseListQuery(req.nextUrl.searchParams, { sortWhitelist: ['order', 'createdAt'], defaultSort: 'order', defaultOrder: 'asc' })
  const status = req.nextUrl.searchParams.get('status') ?? undefined
  if (status !== undefined && !['draft', 'image_pending', 'image_ready', 'video_pending', 'video_ready', 'audio_pending', 'audio_ready', 'failed'].includes(status)) {
    throw new AppError('VALIDATION_ERROR', `status="${status}" fuera de enum`, { field: 'status' })
  }
  const where: Prisma.SceneWhereInput = { projectId: id }
  if (status !== undefined) where.status = status
  if (query.cursor !== null) {
    if (query.sortBy === 'order') {
      // m1: cursor de orderIndex debe ser numérico — inconsistencia ⇒ 422
      const dec = decodeCursor(query.cursor)
      if (typeof dec.v !== 'number') {
        throw new AppError('VALIDATION_ERROR', 'cursor inconsistente con sortBy=order (esperaba orderIndex numérico)', { field: 'cursor' })
      }
      Object.assign(where, seekOrderIndex(query.order, dec.v))
    } else {
      const dec = decodeCursor(query.cursor)
      Object.assign(where, seekCreatedAt(query.order, String(dec.v), dec.i ?? ''))
    }
  }
  const rows = await db.scene.findMany({
    where,
    orderBy: query.sortBy === 'order'
      ? [{ orderIndex: query.order }]
      : [{ createdAt: query.order }, { id: query.order }],
    take: query.limit + 1,
  })
  const items = await Promise.all(rows.map(async (row) => toSceneResponse(row, await referenceDtos(row.id))))
  const page = query.sortBy === 'order'
    ? buildPage(items, query.limit, (scene) => ({ v: scene.orderIndex }))
    : buildPage(items, query.limit, (scene) => ({ v: scene.createdAt, i: scene.id }))
  return okJson(page)
})
