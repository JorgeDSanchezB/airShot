// AirShot — domain/timeline.ts
// Ventana efectiva de una escena en el timeline: el recorte (trim) redefine la
// duración que usan ensamblaje, narración y subtítulos para mantener un solo reloj.

export type TrimmedScene = {
  durationSeconds: number
  trimStartSeconds?: number | null
  trimEndSeconds?: number | null
}

export type TimelineWindow = { startSeconds: number; durationSeconds: number }

export function timelineWindow(scene: TrimmedScene): TimelineWindow {
  const start = Math.max(0, scene.trimStartSeconds ?? 0)
  const end = scene.trimEndSeconds ?? start + scene.durationSeconds
  return { startSeconds: start, durationSeconds: Math.max(0, end - start) }
}
