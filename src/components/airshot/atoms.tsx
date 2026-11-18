'use client'

// AirShot — atoms: StatusChip, ErrorNotice (por code, con hints accionables),
// DurationSlider (límites de runtime-config, nunca constantes propias), Labeled.

import { AlertTriangle, RotateCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  storyboard_ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  in_production: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  assembling: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  assembled: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  failed: 'bg-destructive/15 text-destructive',
  image_pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  video_pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  audio_pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  image_ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  video_ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  audio_ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  running: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
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
  return <Badge variant="secondary" className={STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground'}>{STATUS_LABELS[status] ?? status}</Badge>
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
      <span className="w-10 text-right font-mono text-xs">{value}s</span>
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
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      {hint !== undefined && <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  )
}
