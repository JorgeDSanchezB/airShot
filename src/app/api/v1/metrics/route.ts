// GET /api/v1/metrics — exposición Prometheus (text/plain 0.0.4).
// Contadores/summaries in-process + gauges calculados al vuelo (cola, disco,
// uptime, memoria). Sin dependencias externas.
import { NextRequest, NextResponse } from 'next/server'
import { statfs } from 'node:fs/promises'
import { db } from '@/lib/db'
import { withRoute, StaticRouteCtx } from '@/lib/airshot/core/http'
import { renderPrometheus, type GaugeSample } from '@/lib/airshot/core/metrics'
import { storage } from '@/lib/airshot/infrastructure/storage'
import { listActiveAssemblyJobs } from '@/lib/airshot/services/jobs'

export const dynamic = 'force-dynamic'

export const GET = withRoute<StaticRouteCtx>(async (_req: NextRequest) => {
  const [assemblies, audioQA, pendingScenes] = await Promise.all([
    db.assemblyJob.count({ where: { jobType: 'assembly', status: { in: ['pending', 'running'] } } }),
    db.assemblyJob.count({ where: { jobType: 'audio_qa', status: { in: ['pending', 'running'] } } }),
    db.scene.count({ where: { status: { endsWith: '_pending' } } }),
  ])
  const gauges: GaugeSample[] = [
    { name: 'assembly_jobs_active', help: 'Jobs de ensamblaje pending/running', value: assemblies },
    { name: 'audio_qa_jobs_active', help: 'Jobs de QA de audio pending/running', value: audioQA },
    { name: 'scene_jobs_active', help: 'Escenas en estado *_pending', value: pendingScenes },
    { name: 'assembly_runners_in_process', help: 'Runners de ensamblaje vivos en este proceso', value: listActiveAssemblyJobs().length },
    { name: 'uptime_seconds', help: 'Segundos desde el arranque del proceso', value: Math.round(process.uptime()) },
    { name: 'rss_bytes', help: 'Memoria residente del proceso', value: process.memoryUsage().rss },
  ]
  try {
    const space = await statfs(storage.root)
    gauges.push(
      { name: 'disk_free_bytes', help: 'Espacio libre en data.root', value: Number(space.bavail) * Number(space.bsize) },
      { name: 'disk_total_bytes', help: 'Espacio total en data.root', value: Number(space.blocks) * Number(space.bsize) },
    )
  } catch {
    // sin statfs: se omiten los gauges de disco (no se inventan valores)
  }
  return new NextResponse(renderPrometheus(gauges), {
    status: 200,
    headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store' },
  })
})
