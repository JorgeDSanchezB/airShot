// AirShot — core/logger.ts
// Logging estructurado en una línea JSON (ts, level, event, campos).
// Nivel mínimo desde config `app.log_level` (INFO en config.yaml); los campos
// con aspecto de secreto se redactan siempre. Salida a stdout/stderr del proceso.

import { airshotConfig } from '@/lib/airshot/config/loader'

const LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof LEVELS)[number]

function configuredLevel(): LogLevel {
  const raw = airshotConfig.app.log_level.toLowerCase()
  return (LEVELS as readonly string[]).includes(raw) ? (raw as LogLevel) : 'info'
}

const REDACT = /^(api[_-]?key|authorization|token|secret|password)$/i

function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (REDACT.test(key)) {
      out[key] = '[redacted]'
    } else if (value instanceof Error) {
      out[key] = { name: value.name, message: value.message }
    } else {
      out[key] = value
    }
  }
  return out
}

function emit(level: LogLevel, event: string, fields: Record<string, unknown>): void {
  if (LEVELS.indexOf(level) < LEVELS.indexOf(configuredLevel())) return
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...sanitize(fields) })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (event: string, fields: Record<string, unknown> = {}) => emit('debug', event, fields),
  info: (event: string, fields: Record<string, unknown> = {}) => emit('info', event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}) => emit('warn', event, fields),
  error: (event: string, fields: Record<string, unknown> = {}) => emit('error', event, fields),
}
