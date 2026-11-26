'use client'

// AirShot — organisms/tabs/TimelineTab (editor de timeline):
// tira de escenas con miniatura, recorte in/out, reordenación, regeneración por
// escena y re-ensamblaje (la caché reutiliza los segmentos no afectados).

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Film, Image as ImageIcon, Mic, Play, RotateCcw, Scissors, Video } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { StatusChip } from '@/components/airshot/atoms'
import { timelineWindow } from '@/lib/airshot/domain/timeline'
import {
  useAssemble,
  useAssemblies,
  useGenerateSceneAudio,
  useGenerateSceneImage,
  useGenerateSceneVideo,
  usePatchScene,
  useReorderScenes,
  useRuntimeConfig,
  useScenes,
} from '@/hooks/airshot'
import type { ProjectResponse, SceneResponse } from '@/lib/airshot-client/types'

function TrimField({ scene, onCommit }: { scene: SceneResponse; onCommit: (body: Record<string, number | null>) => void }) {
  const [start, setStart] = useState<string>(String(scene.trimStartSeconds ?? 0))
  const [end, setEnd] = useState<string>(String(scene.trimEndSeconds ?? scene.videoEffectiveSeconds ?? scene.durationSeconds))
  const window = timelineWindow({ ...scene, trimStartSeconds: Number(start) || 0, trimEndSeconds: Number(end) || null })
  return (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
      <Scissors className="size-3" aria-hidden />
      <label className="flex items-center gap-1">
        in
        <Input
          type="number"
          step="0.1"
          min={0}
          value={start}
          onChange={(e) => setStart(e.target.value)}
          onBlur={() => onCommit({ trimStartSeconds: Number(start) || 0, trimEndSeconds: Number(end) || null })}
          className="h-6 w-16 px-1 text-[10px]"
          aria-label={`Entrada del clip de la escena ${scene.orderIndex + 1}`}
        />
      </label>
      <label className="flex items-center gap-1">
        out
        <Input
          type="number"
          step="0.1"
          min={0}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          onBlur={() => onCommit({ trimStartSeconds: Number(start) || 0, trimEndSeconds: Number(end) || null })}
          className="h-6 w-16 px-1 text-[10px]"
          aria-label={`Salida del clip de la escena ${scene.orderIndex + 1}`}
        />
      </label>
      <Badge variant="outline" className="font-mono text-[10px]">{window.durationSeconds.toFixed(1)}s</Badge>
    </div>
  )
}

export function TimelineTab({ project }: { project: ProjectResponse }) {
  const runtime = useRuntimeConfig()
  const scenesQuery = useScenes(project.id)
  const assemblies = useAssemblies(project.id)
  const reorder = useReorderScenes()
  const patch = usePatchScene()
  const genImage = useGenerateSceneImage()
  const genVideo = useGenerateSceneVideo()
  const genAudio = useGenerateSceneAudio()
  const assemble = useAssemble()

  const scenes = useMemo(() => scenesQuery.data?.pages.flatMap((page) => page.items) ?? [], [scenesQuery.data])
  const jobs = assemblies.data?.pages.flatMap((page) => page.items) ?? []
  const latest = jobs.find((job) => job.jobType === 'assembly' && job.outputUrl !== null)
  const aspect = runtime.data?.assembly.aspects[0] ?? '16:9'
  const totalSeconds = scenes.reduce((acc, scene) => acc + timelineWindow(scene).durationSeconds, 0)
  const missingVisual = scenes.filter((s) => s.videoClipPath === null && s.imageBasePath === null).length
  const missingAudio = (runtime.data?.assembly.require_audio ?? true) ? scenes.filter((s) => s.audioPath === null).length : 0
  const canAssemble = scenes.length > 0 && missingVisual === 0 && missingAudio === 0

  function move(index: number, direction: -1 | 1) {
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
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">timeline · corte</p>
              <h3 className="mt-1.5 font-display text-base font-semibold tracking-tight">Edición por escena</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted-foreground">
              <Badge variant="outline">{scenes.length} escenas</Badge>
              <Badge variant="outline">{totalSeconds.toFixed(1)}s total</Badge>
              {latest !== undefined && latest.progress !== null && latest.status === 'running' && (
                <span>{latest.progress.stage} {latest.progress.done}/{latest.progress.total}</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="gap-1"
              disabled={!canAssemble || assemble.isPending}
              onClick={() => void assemble.mutateAsync({
                projectId: project.id,
                body: { includeAudio: true, musicVolume: project.musicVolume, aspect, subtitles: 'srt', duckMusic: project.musicAssetKey !== null, coverSceneId: null },
              })}
            >
              <Play className="size-3" /> Re-ensamblar ({aspect})
            </Button>
            <span className="font-mono text-[10px] text-muted-foreground">
              solo se re-renderizan los segmentos afectados por el recorte
            </span>
          </div>
          {!canAssemble && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Pendiente: {missingVisual} escena(s) sin imagen ni clip{missingAudio > 0 ? `, ${missingAudio} sin narración` : ''}.
            </p>
          )}
          {latest?.outputUrl !== undefined && latest.outputUrl !== null && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">
                <span className="flex items-center gap-1.5"><Film className="size-3" aria-hidden /> última salida</span>
                <a href={latest.outputUrl} download className="normal-case tracking-normal underline underline-offset-2" target="_blank" rel="noreferrer">
                  <Download className="inline size-3" /> final.mp4
                </a>
                {latest.subtitlesUrl !== null && (
                  <a href={latest.subtitlesUrl} download className="normal-case tracking-normal underline underline-offset-2" target="_blank" rel="noreferrer">
                    subtítulos.srt
                  </a>
                )}
              </div>
              <div className="overflow-hidden rounded-lg border shadow-[0_18px_40px_-18px] shadow-black/20">
                <video src={latest.outputUrl} controls preload="metadata" className="aspect-video w-full bg-black/90" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">tira de escenas</p>
            <span className="slug ml-auto font-mono text-[10px] text-muted-foreground">recorte in/out por clip</span>
          </div>
          {scenes.length === 0 && <p className="text-xs text-muted-foreground">Sin escenas todavía.</p>}
          <div className="flex snap-x gap-3 overflow-x-auto pb-2">
            {scenes.map((scene, index) => {
              const busy = scene.status.endsWith('_pending') || genImage.isPending || genVideo.isPending || genAudio.isPending
              return (
                <div key={scene.id} className="w-64 flex-none snap-start rounded-lg border p-2.5">
                  <div className="relative overflow-hidden rounded-md bg-muted">
                    {scene.imageUrl !== null ? (
                      <img src={scene.imageUrl} alt={`Miniatura de la escena ${index + 1}`} className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="flex aspect-video items-center justify-center text-muted-foreground"><ImageIcon className="size-5" /></div>
                    )}
                    <Badge className="absolute left-1.5 top-1.5 font-mono text-[10px]">#{index + 1}</Badge>
                    {scene.videoUrl !== null && <Badge variant="outline" className="absolute right-1.5 top-1.5 bg-background/80 font-mono text-[10px]">clip</Badge>}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <StatusChip status={scene.status} />
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{timelineWindow(scene).durationSeconds.toFixed(1)}s</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{scene.narrationText ?? scene.improvedText ?? scene.originalText}</p>
                  <Separator className="my-2" />
                  <TrimField
                    key={`${scene.id}-${scene.trimStartSeconds}-${scene.trimEndSeconds}-${scene.videoEffectiveSeconds}`}
                    scene={scene}
                    onCommit={(body) => void patch.mutateAsync({ id: scene.id, body })}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" disabled={busy || scene.imageBasePath === null} onClick={() => void genVideo.mutateAsync({ id: scene.id })} title="Regenerar vídeo desde la imagen">
                      <Video className="size-3" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" disabled={busy} onClick={() => void genImage.mutateAsync(scene.id)} title="Regenerar imagen">
                      <ImageIcon className="size-3" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" disabled={busy} onClick={() => void genAudio.mutateAsync({ id: scene.id })} title="Regenerar narración">
                      <Mic className="size-3" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" disabled={(scene.trimStartSeconds ?? 0) === 0 && scene.trimEndSeconds === null} onClick={() => void patch.mutateAsync({ id: scene.id, body: { trimStartSeconds: null, trimEndSeconds: null } })} title="Quitar recorte">
                      <RotateCcw className="size-3" />
                    </Button>
                    <span className="ml-auto flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-1" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Mover escena ${index + 1} a la izquierda`}>
                        <ArrowUp className="size-3 -rotate-90" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 px-1" disabled={index === scenes.length - 1} onClick={() => move(index, 1)} aria-label={`Mover escena ${index + 1} a la derecha`}>
                        <ArrowDown className="size-3 -rotate-90" />
                      </Button>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
