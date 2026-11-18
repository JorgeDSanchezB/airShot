// AirShot — domain/duration-mapper.ts (ADR-009)
// supported_durations no vacío → la duración solicitada se redondea a la
// soportada más cercana (distancia mínima absoluta; empate → la menor).
// Lista vacía → continuo dentro de [scene.min, scene.max] (clamp).

import { airshotConfig } from '@/lib/airshot/config/loader'

export type DurationCapabilities = { supportedDurations: number[] }

export function clampDuration(seconds: number): number {
  const { min_duration_seconds: min, max_duration_seconds: max } = airshotConfig.scene
  return Math.min(max, Math.max(min, Math.round(seconds)))
}

export function mapDuration(requestedSeconds: number, caps: DurationCapabilities): number {
  const clamped = clampDuration(requestedSeconds)
  const supported = caps.supportedDurations ?? []
  if (supported.length === 0) return clamped
  let best = supported[0]
  let bestDist = Math.abs(supported[0] - clamped)
  for (const d of supported) {
    const dist = Math.abs(d - clamped)
    if (dist < bestDist || (dist === bestDist && d < best)) {
      best = d
      bestDist = dist
    }
  }
  return best
}
