'use client'

// AirShot — organisms/tabs/StoryboardTab (UC-02 → UC-05):
// historia → generar storyboard (regenerate opcional) → tarjetas de escena
// (prompt, duración, imagen IA/subida, vídeo async + sondeo, narración TTS,
// referencias asignadas, reordenar/borrar). Virtualización >50 (§5.3).

import { useMemo, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/airshot/atoms'
import { ListOrVirtual } from '@/components/airshot/VirtualList'
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
      <Card className="p-0">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Historia</h3>
            <span className="font-mono text-[10px] text-muted-foreground">
              {hasStoryboard ? 'storyboard generado' : 'sin storyboard'} · {project.sceneCount} escenas
            </span>
          </div>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button size="sm" variant="ghost" className="text-xs text-muted-foreground">Ver historia original</Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-xs leading-relaxed">{project.originalStory}</p>
            </CollapsibleContent>
          </Collapsible>
          {hasStoryboard && (
            <Collapsible defaultOpen>
              <CollapsibleTrigger asChild>
                <Button size="sm" variant="ghost" className="text-xs text-muted-foreground">Historia mejorada (improvedStory)</Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-xs leading-relaxed">{project.improvedStory}</p>
              </CollapsibleContent>
            </Collapsible>
          )}
          <div className="flex flex-wrap items-center gap-2">
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
              className="ml-auto gap-1"
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

      {scenesQuery.isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
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
          <Button variant="outline" onClick={() => void scenesQuery.fetchNextPage()} disabled={scenesQuery.isFetchingNextPage}>
            {scenesQuery.isFetchingNextPage ? 'Cargando…' : 'Cargar más escenas'}
          </Button>
        </div>
      )}
    </div>
  )
}
