'use client'

// AirShot — organisms/tabs/StoryboardTab (UC-02 → UC-05):
// historia → generar storyboard (regenerate opcional) → tarjetas de escena
// (prompt, duración, imagen IA/subida, vídeo async + sondeo, narración TTS,
// referencias asignadas, reordenar/borrar). Virtualización >50 (§5.3).

import { useMemo, useState } from 'react'
import { ChevronDown, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/airshot/atoms'
import { ListOrVirtual } from '@/components/airshot/VirtualList'
import { BatchPanel } from '@/components/airshot/molecules/BatchPanel'
import { SceneCard } from '@/components/airshot/molecules/SceneCard'
import { useGenerateStoryboard, useReferences, useReorderScenes, useRuntimeConfig, useScenes, useVoices } from '@/hooks/airshot'
import type { ProjectResponse } from '@/lib/airshot-client/types'

export function StoryboardTab({ project }: { project: ProjectResponse }) {
  const runtime = useRuntimeConfig()
  const scenesQuery = useScenes(project.id)
  const voices = useVoices(project.ttsProvider ?? undefined)
  const projectRefs = useReferences({ scope: 'project', projectId: project.id })
  const globalRefs = useReferences({ scope: 'global' })
  const generateStoryboard = useGenerateStoryboard()
  const reorder = useReorderScenes()
  const [targetDuration, setTargetDuration] = useState<string>(String(runtime.data?.scene.default_duration_seconds ?? 6))

  const scenes = useMemo(() => scenesQuery.data?.pages.flatMap((page) => page.items) ?? [], [scenesQuery.data])
  const voiceItems = voices.data?.pages.flatMap((p) => p.items) ?? []
  const referenceItems = useMemo(
    () => [...(projectRefs.data?.pages.flatMap((p) => p.items) ?? []), ...(globalRefs.data?.pages.flatMap((p) => p.items) ?? [])],
    [projectRefs.data, globalRefs.data],
  )

  const min = runtime.data?.scene.min_duration_seconds ?? 4
  const max = runtime.data?.scene.max_duration_seconds ?? 15
  const hasStoryboard = project.improvedStory !== null

  function moveScene(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= scenes.length) return
    const ids = scenes.map((s) => s.id)
    const moved = ids.splice(index, 1)[0]
    ids.splice(target, 0, moved)
    void reorder.mutateAsync({ projectId: project.id, sceneIds: ids })
  }

  return (
    <div className="space-y-4">
      <Card className="group elevate-hover p-0 hover:border-primary/40">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">guion del proyecto</p>
              <h3 className="mt-1 font-serif text-lg italic leading-tight text-primary">Historia</h3>
            </div>
            <span className="slug font-mono text-[10px] text-muted-foreground">
              {hasStoryboard ? 'storyboard generado' : 'sin storyboard'} · {project.sceneCount} escenas
            </span>
          </div>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="group gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronDown className="size-3.5 transition-transform duration-300 group-data-[state=open]:rotate-180" aria-hidden />
                Ver historia original
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs leading-relaxed">{project.originalStory}</p>
            </CollapsibleContent>
          </Collapsible>
          {hasStoryboard && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="group gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown className="size-3.5 transition-transform duration-300 group-data-[state=open]:rotate-180" aria-hidden />
                  Historia mejorada (improvedStory)
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="whitespace-pre-wrap rounded-lg border-l-2 border-primary/40 bg-muted/50 p-3 text-xs leading-relaxed">{project.improvedStory}</p>
              </CollapsibleContent>
            </Collapsible>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-dashed pt-3">
            <Label className="text-xs text-muted-foreground">Duración objetivo por escena</Label>
            <Select value={targetDuration} onValueChange={setTargetDuration}>
              <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((seconds) => (
                  <SelectItem key={seconds} value={String(seconds)}>{seconds}s</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="ml-auto gap-1 shadow-[0_8px_24px_-8px] shadow-primary/50"
              disabled={generateStoryboard.isPending}
              onClick={() => {
                if (hasStoryboard && !window.confirm('regenerate=true reemplaza las escenas actuales (y sus assets). ¿Continuar?')) return
                void generateStoryboard.mutateAsync({
                  projectId: project.id,
                  body: { ...(hasStoryboard ? { regenerate: true } : {}), targetDurationSeconds: Number(targetDuration) },
                })
              }}
            >
              {hasStoryboard ? <RefreshCw className="size-3" /> : <Sparkles className="size-3" />}
              {generateStoryboard.isPending ? 'Generando storyboard…' : hasStoryboard ? 'Regenerar storyboard' : 'Generar storyboard'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {scenes.length > 0 && <BatchPanel project={project} scenes={scenes} />}

      {scenesQuery.isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}

      {!scenesQuery.isLoading && scenes.length === 0 && !hasStoryboard && (
        <EmptyState label="Sin escenas" hint="Genera el storyboard con el botón de arriba." />
      )}
      {!scenesQuery.isLoading && scenes.length === 0 && hasStoryboard && (
        <EmptyState label="Storyboard vacío" hint="Regenera el storyboard (el LLM devolvió cero escenas)." />
      )}

      <ListOrVirtual
        items={scenes}
        estimateSize={520}
        renderItem={(scene, index) => (
          <div className="pb-4">
            <SceneCard
              scene={scene}
              project={project}
              config={runtime.data}
              voices={voiceItems}
              references={referenceItems}
              onMoveUp={index > 0 ? () => moveScene(index, -1) : undefined}
              onMoveDown={index < scenes.length - 1 ? () => moveScene(index, 1) : undefined}
            />
          </div>
        )}
      />

      {scenesQuery.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" className="hover:border-primary/40" onClick={() => void scenesQuery.fetchNextPage()} disabled={scenesQuery.isFetchingNextPage}>
            {scenesQuery.isFetchingNextPage ? 'Cargando…' : 'Cargar más escenas'}
          </Button>
        </div>
      )}
    </div>
  )
}
