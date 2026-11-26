// AirShot — core/metrics.ts
// Métricas in-process en formato Prometheus (sin dependencias).
// Contadores y resúmenes de duración se acumulan aquí; los gauges (cola, disco)
// se calculan al exponer /api/v1/metrics. Cardinalidad acotada: rutas normalizadas.

type Labels = Record<string, string>

type CounterEntry = { name: string; labels: Labels; value: number }
type SummaryEntry = { name: string; labels: Labels; sum: number; count: number }

const counters = new Map<string, CounterEntry>()
const summaries = new Map<string, SummaryEntry>()

function keyOf(name: string, labels: Labels): string {
  const pairs = Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join(',')
  return `${name}|${pairs}`
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function formatLabels(labels: Labels): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return ''
  return `{${entries.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(',')}}`
}

export function incCounter(name: string, labels: Labels = {}, by = 1): void {
  const key = keyOf(name, labels)
  const entry = counters.get(key)
  if (entry === undefined) counters.set(key, { name, labels: { ...labels }, value: by })
  else entry.value += by
}

export function observeDurationSeconds(name: string, seconds: number, labels: Labels = {}): void {
  const key = keyOf(name, labels)
  const entry = summaries.get(key)
  if (entry === undefined) summaries.set(key, { name, labels: { ...labels }, sum: seconds, count: 1 })
  else {
    entry.sum += seconds
    entry.count += 1
  }
}

/** UUIDs → `:id` para no multiplicar series por recurso. */
export function normalizeRoute(pathname: string): string {
  return pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
}

export type GaugeSample = { name: string; help: string; labels?: Labels; value: number }

export function renderPrometheus(gauges: GaugeSample[] = []): string {
  const lines: string[] = []

  const byCounterName = new Map<string, CounterEntry[]>()
  for (const entry of counters.values()) {
    const list = byCounterName.get(entry.name) ?? []
    list.push(entry)
    byCounterName.set(entry.name, list)
  }
  for (const [name, entries] of [...byCounterName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`# TYPE airshot_${name} counter`)
    for (const entry of entries.sort((a, b) => formatLabels(a.labels).localeCompare(formatLabels(b.labels)))) {
      lines.push(`airshot_${name}${formatLabels(entry.labels)} ${entry.value}`)
    }
  }

  const bySummaryName = new Map<string, SummaryEntry[]>()
  for (const entry of summaries.values()) {
    const list = bySummaryName.get(entry.name) ?? []
    list.push(entry)
    bySummaryName.set(entry.name, list)
  }
  for (const [name, entries] of [...bySummaryName.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`# TYPE airshot_${name} summary`)
    for (const entry of entries.sort((a, b) => formatLabels(a.labels).localeCompare(formatLabels(b.labels)))) {
      lines.push(`airshot_${name}_sum${formatLabels(entry.labels)} ${entry.sum.toFixed(3)}`)
      lines.push(`airshot_${name}_count${formatLabels(entry.labels)} ${entry.count}`)
    }
  }

  const helpByGauge = new Map<string, string>()
  for (const gauge of gauges) helpByGauge.set(gauge.name, gauge.help)
  for (const [name, help] of [...helpByGauge.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`# HELP airshot_${name} ${help}`)
    lines.push(`# TYPE airshot_${name} gauge`)
    for (const gauge of gauges.filter((g) => g.name === name)) {
      lines.push(`airshot_${name}${formatLabels(gauge.labels ?? {})} ${gauge.value}`)
    }
  }

  return `${lines.join('\n')}\n`
}

/** Solo para tests. */
export function resetMetrics(): void {
  counters.clear()
  summaries.clear()
}
