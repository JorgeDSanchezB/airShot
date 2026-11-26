// GET /api/v1/ops/summary — resumen para el panel de operaciones (Sistema):
// cola de jobs, fallos recientes con su código, escenas pendientes y disco.
import { NextRequest } from 'next/server'
import { statfs } from 'node:fs/promises'
import { db } from '@/lib/db'
import { okJson, withRoute, StaticRouteCtx } from '@/lib/airshot/core/http'
import { storage } from '@/lib/airshot/infrastructure/storage'

export const dynamic = 'force-dynamic'

function errorCode(raw: string | null): string | null {
  if (raw === null) return null
  try {
    const parsed = JSON.parse(raw) as { code?: string }
    return parsed.code ?? null
  } catch {
    return null
  }
}

export const GET = withRoute<StaticRouteCtx>(async (_req: NextRequest) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [pending, running, failed24h, pendingScenes, failedRows] = await Promise.all([
    db.assemblyJob.count({ where: { status: 'pending' } }),
    db.assemblyJob.count({ where: { status: 'running' } }),
    db.assemblyJob.count({ where: { status: 'failed', finishedAt: { gte: since } } }),
    db.scene.count({ where: { status: { endsWith: '_pending' } } }),
    db.assemblyJob.findMany({
      where: { status: 'failed' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, projectId: true, jobType: true, status: true, errorMessage: true, createdAt: true },
    }),
  ])
  let disk: { freeBytes: number; totalBytes: number } | null = null
  try {
    const space = await statfs(storage.root)
    disk = {
      freeBytes: Number(space.bavail) * Number(space.bsize),
      totalBytes: Number(space.blocks) * Number(space.bsize),
    }
  } catch {
    disk = null
  }
  return okJson({
    uptimeSeconds: Math.round(process.uptime()),
    jobs: { pending, running, failed24h },
    scenes: { pending: pendingScenes },
    disk,
    recentFailed: failedRows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      jobType: row.jobType,
      status: row.status,
      code: errorCode(row.errorMessage),
      createdAt: row.createdAt.toISOString(),
    })),
  })
})
