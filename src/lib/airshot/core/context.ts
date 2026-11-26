// AirShot — core/context.ts
// Contexto de traza por request vía AsyncLocalStorage (solo runtime Node).
// El traceId ya viaja en logs y en x-trace-id; aquí se propaga W3C `traceparent`
// a las llamadas salientes a proveedores (compatible con OpenTelemetry, sin SDK).

import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes } from 'node:crypto'

export type TraceContext = { traceId: string }

const storage = new AsyncLocalStorage<TraceContext>()

export function runWithTraceContext<T>(ctx: TraceContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn)
}

export function currentTraceId(): string | null {
  return storage.getStore()?.traceId ?? null
}

/** `00-<trace-id 32 hex>-<span-id 16 hex>-01` (version 00, sampled). */
export function traceparentOf(traceId: string, spanId: string = randomBytes(8).toString('hex')): string {
  const trace = traceId.replace(/[^0-9a-f]/gi, '').toLowerCase().padStart(32, '0').slice(0, 32)
  return `00-${trace}-${spanId}-01`
}
