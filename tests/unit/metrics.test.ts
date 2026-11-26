// Unit: métricas Prometheus sin dependencias (core/metrics.ts).
import { beforeEach, describe, expect, it } from 'vitest'
import {
  incCounter,
  normalizeRoute,
  observeDurationSeconds,
  renderPrometheus,
  resetMetrics,
} from '@/lib/airshot/core/metrics'

beforeEach(() => resetMetrics())

describe('metrics · contadores', () => {
  it('acumula por etiquetas y ordena series', () => {
    incCounter('jobs_total', { type: 'assembly', status: 'completed' })
    incCounter('jobs_total', { type: 'assembly', status: 'completed' })
    incCounter('jobs_total', { type: 'audio_qa', status: 'failed' })
    const text = renderPrometheus()
    expect(text).toContain('# TYPE airshot_jobs_total counter')
    expect(text).toContain('airshot_jobs_total{status="completed",type="assembly"} 2')
    expect(text).toContain('airshot_jobs_total{status="failed",type="audio_qa"} 1')
  })

  it('escapa comillas, barras y saltos de línea en etiquetas', () => {
    incCounter('http_requests_total', { route: '/a"b\\c\nd', method: 'GET', status: '200' })
    const text = renderPrometheus()
    expect(text).toContain('route="/a\\"b\\\\c\\nd"')
  })
})

describe('metrics · summaries y gauges', () => {
  it('resume duraciones con _sum/_count y expone gauges con HELP', () => {
    observeDurationSeconds('job_duration_seconds', 2, { type: 'assembly' })
    observeDurationSeconds('job_duration_seconds', 4, { type: 'assembly' })
    const text = renderPrometheus([
      { name: 'assembly_jobs_active', help: 'Jobs activos', value: 1 },
      { name: 'disk_free_bytes', help: 'Libre', labels: { root: 'data' }, value: 1234 },
    ])
    expect(text).toContain('# TYPE airshot_job_duration_seconds summary')
    expect(text).toContain('airshot_job_duration_seconds_sum{type="assembly"} 6.000')
    expect(text).toContain('airshot_job_duration_seconds_count{type="assembly"} 2')
    expect(text).toContain('# HELP airshot_assembly_jobs_active Jobs activos')
    expect(text).toContain('airshot_disk_free_bytes{root="data"} 1234')
  })

  it('la salida termina en salto de línea y es estable sin métricas', () => {
    expect(renderPrometheus()).toBe('\n')
  })
})

describe('metrics · normalización de rutas', () => {
  it('colapsa UUIDs a :id (cardinalidad acotada)', () => {
    const uuid = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
    expect(normalizeRoute(`/api/v1/projects/${uuid}/scenes/${uuid}`)).toBe('/api/v1/projects/:id/scenes/:id')
    expect(normalizeRoute('/api/v1/projects')).toBe('/api/v1/projects')
  })
})
