'use client'

// AirShot — molecules/BatchPanel: cola "Generar todo" (imagen→audio→vídeo por escena)
// con progreso, pausa/reanudación/cancelación y errores por escena sin abortar el resto.

import { useState } from 'react'
import { CirclePause, CirclePlay, Layers, Loader2, OctagonX, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { useBatchControl, useLatestBatch, useStartBatch } from '@/hooks/airshot'
import type { BatchRun, BatchStep, ProjectResponse, SceneResponse } from '@/lib/airshot-client/types'

const STEP_LABEL: Record<BatchStep, string> = { image: 'imagen', audio: 'narración', video: 'vídeo' }
const STATUS_LABEL: Record<BatchRun['status'], string> = {
  running: 'en curso',
  paused: 'pausada',
  cancelled: 'cancelada',
  completed: 'completada',
}

export function BatchPanel({ project, scenes }: { project: ProjectResponse; scenes: SceneResponse[] }) {
  const { data } = useLatestBatch(project.id)
  const start = useStartBatch(project.id)
  const control = useBatchControl(project.id)
  const [steps, setSteps] = useState<BatchStep[]>(['image', 'audio', 'video'])
  const [regenerate, setRegenerate] = useState(false)
  const [errorsOpen, setErrorsOpen] = useState(false)
  const batch = data?.batch ?? null
  const active = batch !== null && (batch.status === 'running' || batch.status === 'paused')

  function toggleStep(step: BatchStep, checked: boolean) {
    setSteps((current) => {
      const next = checked ? [...current, step] : current.filter((s) => s !== step)
      return (['image', 'audio', 'video'] as BatchStep[]).filter((s) => next.includes(s))
    })
  }

  const currentIndex = batch?.currentSceneId !== null && batch !== null
    ? scenes.findIndex((s) => s.id === batch.currentSceneId)
    : -1
  const progress = batch !== null && batch.total > 0 ? Math.round((batch.done / batch.total) * 100) : 0

  return (
    <Card className="p-0">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Layers className="size-4 text-primary" aria-hidden />
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">generación masiva</p>
          {batch !== null && (
            <Badge variant={batch.status === 'completed' ? 'secondary' : batch.status === 'cancelled' ? 'outline' : 'default'} className="rounded-full text-[10px]">
              {STATUS_LABEL[batch.status]}
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {active && batch !== null && (
              <>
                {batch.status === 'running' ? (
                  <Button size="sm" variant="outline" className="gap-1" disabled={control.isPending}
                    onClick={() => void control.mutateAsync({ batchId: batch.id, action: 'pause' })}>
                    <CirclePause className="size-3" /> Pausar
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="gap-1" disabled={control.isPending}
                    onClick={() => void control.mutateAsync({ batchId: batch.id, action: 'resume' })}>
                    <CirclePlay className="size-3" /> Reanudar
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:text-destructive" disabled={control.isPending}
                  onClick={() => {
                    if (!window.confirm('¿Cancelar la generación masiva? Las escenas ya procesadas se conservan.')) return
                    void control.mutateAsync({ batchId: batch.id, action: 'cancel' })
                  }}>
                  <OctagonX className="size-3" /> Cancelar
                </Button>
              </>
            )}
            <Button
              size="sm"
              className="gap-1"
              disabled={start.isPending || active || steps.length === 0 || scenes.length === 0}
              onClick={() => void start.mutateAsync({ steps, regenerate })}
            >
              {start.isPending ? <Loader2 className="size-3 animate-spin" /> : <Layers className="size-3" />}
              {active ? 'En curso…' : 'Generar todo'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {(['image', 'audio', 'video'] as BatchStep[]).map((step) => (
            <label key={step} className="flex items-center gap-1.5">
              <Checkbox checked={steps.includes(step)} onCheckedChange={(checked) => toggleStep(step, checked === true)} aria-label={STEP_LABEL[step]} />
              {STEP_LABEL[step]}
            </label>
          ))}
          <span className="h-4 w-px bg-border" aria-hidden />
          <label className="flex items-center gap-1.5">
            <Checkbox checked={regenerate} onCheckedChange={(checked) => setRegenerate(checked === true)} aria-label="Regenerar existentes" />
            regenerar existentes
          </label>
          <span className="ml-auto slug font-mono text-[10px]">
            {steps.length} paso(s) · {scenes.length} escenas
          </span>
        </div>

        {batch !== null && (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-medium">{batch.done}/{batch.total} escenas</span>
              {batch.skipped > 0 && <span className="text-muted-foreground">{batch.skipped} pasos ya existentes</span>}
              {currentIndex >= 0 && batch.status === 'running' && (
                <span className="text-muted-foreground">procesando escena {currentIndex + 1}…</span>
              )}
              <span className="ml-auto slug font-mono text-[10px] text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} />
            {batch.errors.length > 0 && (
              <div className="text-xs">
                <Button size="sm" variant="ghost" className="h-6 gap-1 px-1 text-destructive hover:text-destructive" onClick={() => setErrorsOpen((v) => !v)}>
                  <RotateCcw className="size-3" /> {batch.errors.length} error(es) por escena {errorsOpen ? '· ocultar' : '· ver'}
                </Button>
                {errorsOpen && (
                  <ul className="mt-1 space-y-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
                    {batch.errors.slice(0, 20).map((error, i) => (
                      <li key={`${error.sceneId}-${error.step}-${i}`}>
                        escena {scenes.findIndex((s) => s.id === error.sceneId) + 1 || '?'} · {STEP_LABEL[error.step]} · {error.code}: {error.detail}
                      </li>
                    ))}
                    {batch.errors.length > 20 && <li>… {batch.errors.length - 20} más</li>}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
