'use client'

// AirShot — atoms: StatusChip, ErrorNotice (por code, con hints accionables),
// DurationSlider (límites de runtime-config, nunca constantes propias), Labeled.

import { AlertTriangle, Clapperboard, KeyRound, RotateCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/* semántica de color por familia de estado (dot + tinte suave) */
type StatusTone = 'neutral' | 'ok' | 'busy' | 'error'

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  ok: 'bg-emerald-600/12 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300',
  busy: 'bg-primary/12 text-primary',
  error: 'bg-destructive/12 text-destructive',
}

const TONE_DOT: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground/60',
  ok: 'bg-emerald-500',
  busy: 'bg-primary',
  error: 'bg-destructive',
}

function toneFor(status: string): StatusTone {
  if (status === 'failed') return 'error'
  if (status === 'draft') return 'neutral'
  if (status.endsWith('_ready') || status === 'storyboard_ready' || status === 'assembled' || status === 'completed') return 'ok'
  if (status.endsWith('_pending') || status === 'running' || status === 'pending' || status === 'in_production' || status === 'assembling') return 'busy'
  return 'neutral'
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'borrador',
  storyboard_ready: 'storyboard listo',
  in_production: 'en producción',
  assembling: 'ensamblando',
  assembled: 'ensamblado',
  failed: 'fallido',
  image_pending: 'imagen en curso',
  video_pending: 'vídeo en curso',
  audio_pending: 'audio en curso',
  image_ready: 'imagen lista',
  video_ready: 'vídeo listo',
  audio_ready: 'audio listo',
  pending: 'pendiente',
  running: 'en curso',
  completed: 'completado',
}

export function StatusChip({ status }: { status: string }) {
  const tone = toneFor(status)
  return (
    <Badge variant="secondary" className={`gap-1.5 rounded-full ${TONE_CLASSES[tone]}`}>
      <span className={`${TONE_DOT[tone]} ${tone === 'busy' ? 'pulse-dot' : ''} size-1.5 rounded-full`} aria-hidden />
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}

/** §5.4/§3.1.1: ErrorNotice por `code`; retryable ⇒ botón reintentar accionable. */
export function ErrorNotice({
  problem,
  onRetry,
}: {
  problem: { code: string; title: string; detail: string; retryable: boolean } | null
  onRetry?: () => void
}) {
  if (problem === null) return null
  return (
    <Alert variant="destructive" className="mt-2 py-2">
      <AlertTriangle className="size-4" />
      <AlertTitle className="text-xs font-mono">
        {problem.code}
        {problem.retryable ? ' · reintentable' : ''}
      </AlertTitle>
      <AlertDescription className="text-xs">
        {problem.detail}
        {problem.code === 'AUTH_REQUIRED' && (
          <Button asChild size="sm" variant="outline" className="ml-2 h-6 gap-1 py-0 text-xs">
            <a href="/unlock">
              <KeyRound className="size-3" /> Desbloquear
            </a>
          </Button>
        )}
        {onRetry !== undefined && (
          <Button size="sm" variant="outline" className="ml-2 h-6 gap-1 py-0 text-xs" onClick={onRetry}>
            <RotateCw className="size-3" /> Reintentar
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function DurationSlider({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={(values) => onChange(values[0] ?? value)}
        className="w-32"
        aria-label="Duración de la escena en segundos"
      />
      <span className="slug w-10 text-right font-mono text-xs text-muted-foreground">{value}s</span>
    </div>
  )
}

/** §5.4: ausente ⇒ omitir; null ⇒ «—»; desconocido ⇒ marcado. */
export function NullOrUnknown({ children, unknown }: { children: React.ReactNode; unknown?: boolean }) {
  if (unknown) {
    return (
      <span className="font-mono text-xs text-muted-foreground">
        {children}
        <Badge variant="outline" className="ml-1 py-0 text-[10px]">no registrado</Badge>
      </span>
    )
  }
  return <span className="text-xs">{children}</span>
}

export function EmptyState({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed py-14 text-center">
      <div className="projector-glow pointer-events-none absolute inset-0" aria-hidden />
      <span className="flex size-12 items-center justify-center rounded-full border bg-card text-muted-foreground">
        <Clapperboard className="size-5" aria-hidden />
      </span>
      <p className="mt-4 font-display text-sm font-medium">{label}</p>
      {hint !== undefined && <p className="mt-1 max-w-sm text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  )
}
