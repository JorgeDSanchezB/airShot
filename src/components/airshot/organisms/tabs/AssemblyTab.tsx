'use client'

// AirShot — organisms/tabs/AssemblyTab (UC-08/UC-09): música opcional (upload con
// reemplazo + volumen + fade de config), ensamblar (202 + sondeo de jobs),
// historial con salida descargable, y QA de audio (Earshot, opt-in por config).

import { useRef, useState } from 'react'
import { Download, Film, Image as ImageIcon, Music, Play, RotateCcw, Trash2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { StatusChip } from '@/components/airshot/atoms'
import { useAssemble, useAssemblies, useAudioQA, useMusicMutation, usePatchProject, useRetryAssembly, useRuntimeConfig, useScenes } from '@/hooks/airshot'
import type { ProjectResponse } from '@/lib/airshot-client/types'

export function AssemblyTab({ project }: { project: ProjectResponse }) {
  const runtime = useRuntimeConfig()
  const scenesQuery = useScenes(project.id)
  const assemblies = useAssemblies(project.id)
  const assemble = useAssemble()
  const retry = useRetryAssembly()
  const audioQA = useAudioQA()
  const musicUpload = useMusicMutation('upload')
  const musicDelete = useMusicMutation('delete')
  const patchProject = usePatchProject()
  const musicInputRef = useRef<HTMLInputElement | null>(null)
  const [includeAudio, setIncludeAudio] = useState(true)
  const [volume, setVolume] = useState(project.musicVolume)
  const [qaFeatures, setQaFeatures] = useState<string[]>(['loudness', 'sync'])
  const [aspect, setAspect] = useState<string | null>(null)
  const [subtitlesMode, setSubtitlesMode] = useState<'none' | 'srt' | 'burn'>('none')
  const [duckMusic, setDuckMusic] = useState(false)
  const [coverSceneId, setCoverSceneId] = useState<string>('none')

  const scenes = scenesQuery.data?.pages.flatMap((page) => page.items) ?? []
  const jobs = assemblies.data?.pages.flatMap((page) => page.items) ?? []
  const aspectOptions = runtime.data?.assembly.aspects ?? []
  const aspectValue = aspect ?? aspectOptions[0] ?? ''
  const missingVideo = scenes.filter((s) => s.videoClipPath === null).length
  const missingAudio = includeAudio && (runtime.data?.assembly.require_audio ?? true)
    ? scenes.filter((s) => s.audioPath === null).length
    : 0
  const canAssemble = scenes.length > 0 && missingVideo === 0 && missingAudio === 0 && aspectValue.length > 0
  const earshotEnabled = runtime.data?.audio_qa.enabled ?? false
  // salida más reciente del ensamblaje (presentación: reproductor final)
  const latestOutput = jobs.find((job) => job.jobType === 'assembly' && job.outputUrl !== null)?.outputUrl ?? null

  return (
    <div className="space-y-4">
      <Card className="p-0">
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">banda sonora · opcional</p>
            <h3 className="mt-1.5 font-display text-base font-semibold tracking-tight">Música</h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {project.musicAssetKey !== null && (
              <Badge variant="outline" className="gap-1 font-mono text-[10px]">
                <Music className="size-3" aria-hidden />
                {project.musicOriginalName ?? 'música'}
                {project.musicDurationSeconds !== null ? ` · ${project.musicDurationSeconds.toFixed(1)}s` : ''}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={musicInputRef}
              type="file"
              accept="audio/mpeg,audio/wav,audio/ogg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file !== undefined) {
                  void musicUpload.mutateAsync({ projectId: project.id, file })
                }
                e.target.value = ''
              }}
            />
            <Button size="sm" variant="outline" className="gap-1" onClick={() => musicInputRef.current?.click()}>
              <Music className="size-3" /> {project.musicAssetKey !== null ? 'Reemplazar música' : 'Subir música'}
            </Button>
            {project.musicUrl !== null && (
              <>
                <audio src={project.musicUrl} controls className="h-8" />
                <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => void musicDelete.mutateAsync({ projectId: project.id })}>
                  <Trash2 className="size-3" /> Quitar
                </Button>
              </>
            )}
          </div>
          {project.musicAssetKey !== null && (
            <div className="flex items-center gap-3">
              <Label className="text-xs text-muted-foreground">Volumen ({volume.toFixed(2)})</Label>
              <Slider
                value={[volume]}
                min={0.05}
                max={1}
                step={0.05}
                onValueChange={(values) => setVolume(values[0] ?? volume)}
                onValueCommit={() => {
                  // persistencia diferida del volumen del proyecto (PATCH)
                  scheduleVolumeSave(patchProject, project.id, volume)
                }}
                className="w-40"
                aria-label="Volumen de la música"
              />
              <span className="slug font-mono text-[10px] text-muted-foreground">fade out en el ensamblaje</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">ffmpeg concat · mezcla + fade</p>
              <h3 className="mt-1.5 font-display text-base font-semibold tracking-tight">Ensamblaje final</h3>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">incluir narración</Label>
              <Switch checked={includeAudio} onCheckedChange={setIncludeAudio} aria-label="Incluir narración" />
            </div>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            concat de clips normalizados ({runtime.data?.assembly.output_fps ?? 24} fps) + mezcla narración/música con fade out.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              formato
              <Select value={aspectValue} onValueChange={setAspect}>
                <SelectTrigger className="h-7 w-24 text-xs" aria-label="Proporción del vídeo final"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {aspectOptions.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              subtítulos
              <Select value={subtitlesMode} onValueChange={(value) => setSubtitlesMode(value as 'none' | 'srt' | 'burn')}>
                <SelectTrigger className="h-7 w-32 text-xs" aria-label="Modo de subtítulos"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">sin subtítulos</SelectItem>
                  <SelectItem value="srt">SRT (sidecar)</SelectItem>
                  <SelectItem value="burn">incrustados</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              portada
              <Select value={coverSceneId} onValueChange={setCoverSceneId}>
                <SelectTrigger className="h-7 w-32 text-xs" aria-label="Escena de portada"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">sin portada</SelectItem>
                  {scenes.map((scene) => (
                    <SelectItem key={scene.id} value={scene.id}>escena {scene.orderIndex + 1}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              ducking
              <Switch
                checked={duckMusic}
                onCheckedChange={setDuckMusic}
                disabled={project.musicAssetKey === null || !includeAudio}
                aria-label="Bajar la música bajo la narración (ducking)"
              />
            </label>
          </div>
          {!canAssemble && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Pendiente para ensamblar: {missingVideo} clip(s) de vídeo{missingAudio > 0 ? ` y ${missingAudio} narración(es) (require_audio=${String(runtime.data?.assembly.require_audio ?? true)})` : ''}.
            </p>
          )}
          <Button
            className="gap-1 shadow-[0_8px_24px_-8px] shadow-primary/40"
            disabled={!canAssemble || assemble.isPending}
            onClick={() => void assemble.mutateAsync({
              projectId: project.id,
              body: {
                includeAudio,
                musicVolume: volume,
                aspect: aspectValue,
                subtitles: subtitlesMode,
                duckMusic,
                coverSceneId: coverSceneId === 'none' ? null : coverSceneId,
              },
            })}
          >
            <Play className="size-4" /> Ensamblar vídeo final
          </Button>
          {latestOutput !== null && (
            <div className="space-y-1.5 pt-1">
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">
                <Film className="size-3" aria-hidden /> salida final · mp4
              </p>
              <div className="overflow-hidden rounded-lg border shadow-[0_18px_40px_-18px] shadow-black/20">
                <video src={latestOutput} controls preload="metadata" className="aspect-video w-full bg-black/90" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">ebur128 / ffprobe · in-process</p>
              <h3 className="mt-1.5 font-display text-base font-semibold tracking-tight">QA de audio (Earshot)</h3>
            </div>
            {!earshotEnabled && <Badge variant="outline" className="font-mono text-[10px]">módulo desactivado en config</Badge>}
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            sonoridad integrada y sincronía. naturalness/artifacts no se miden localmente (se declara, no se inventa).
          </p>
          <div className="flex flex-wrap gap-3">
            {['loudness', 'sync', 'naturalness', 'artifacts'].map((feature) => (
              <label key={feature} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
                <Checkbox
                  checked={qaFeatures.includes(feature)}
                  onCheckedChange={(checked) => {
                    setQaFeatures((prev) => (checked ? [...prev, feature] : prev.filter((f) => f !== feature)))
                  }}
                />
                {feature}
              </label>
            ))}
          </div>
          <Button size="sm" variant="outline" className="gap-1" disabled={!earshotEnabled || qaFeatures.length === 0 || scenes.length === 0} onClick={() => void audioQA.mutateAsync({ projectId: project.id, features: qaFeatures })}>
            <Wand2 className="size-3" /> Ejecutar QA de audio
          </Button>
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">jobs · sondeo</p>
              <h3 className="mt-1.5 font-display text-base font-semibold tracking-tight">Historial de jobs</h3>
            </div>
            <span className="slug font-mono text-[10px] text-muted-foreground">{jobs.length} registros</span>
          </div>
          {jobs.length === 0 && <p className="text-xs text-muted-foreground">Sin jobs aún.</p>}
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-md border p-2.5 text-xs transition-colors hover:bg-secondary/50">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={job.status} />
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">{job.jobType === 'assembly' ? 'ensamblaje' : 'audio-qa'}</Badge>
                  <span className="slug font-mono text-[10px] text-muted-foreground">{job.id.slice(0, 8)}…</span>
                  <span className="slug ml-auto font-mono text-[10px] text-muted-foreground">
                    {new Date(job.createdAt).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'medium' })}
                  </span>
                </div>
                {(job.status === 'pending' || job.status === 'running') && job.progress !== null && (
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                      <span>{job.progress.stage} · {job.progress.done}/{job.progress.total}</span>
                      <span>{job.progress.total > 0 ? Math.round((job.progress.done / job.progress.total) * 100) : 0}%</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Progreso del job (${job.progress.stage})`} aria-valuenow={job.progress.done} aria-valuemax={job.progress.total}>
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${job.progress.total > 0 ? Math.min(100, (job.progress.done / job.progress.total) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                )}
                {job.errorMessage !== null && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <p className="font-mono text-[10px] text-destructive">{job.errorMessage.code}: {job.errorMessage.detail}</p>
                    {job.status === 'failed' && (
                      <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px]" disabled={retry.isPending} onClick={() => void retry.mutateAsync(job)}>
                        <RotateCcw className="size-3" /> Reintentar
                      </Button>
                    )}
                  </div>
                )}
                {job.outputUrl !== null && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {job.jobType === 'assembly' ? (
                      <a href={job.outputUrl} download className="inline-flex items-center gap-1 text-xs underline underline-offset-2" target="_blank" rel="noreferrer">
                        <Download className="size-3" /> Descargar final.mp4
                      </a>
                    ) : (
                      <a href={job.outputUrl} download className="inline-flex items-center gap-1 text-xs underline underline-offset-2" target="_blank" rel="noreferrer">
                        <Download className="size-3" /> Descargar reporte JSON
                      </a>
                    )}
                    {job.subtitlesUrl !== null && (
                      <a href={job.subtitlesUrl} download className="inline-flex items-center gap-1 text-xs underline underline-offset-2" target="_blank" rel="noreferrer">
                        <Download className="size-3" /> subtítulos.srt
                      </a>
                    )}
                    {job.thumbnailUrl !== null && (
                      <a href={job.thumbnailUrl} download className="inline-flex items-center gap-1 text-xs underline underline-offset-2" target="_blank" rel="noreferrer">
                        <ImageIcon className="size-3" /> portada.jpg
                      </a>
                    )}
                    <span className="max-w-full truncate font-mono text-[10px] text-muted-foreground" title={job.outputUrl}>{job.outputUrl}</span>
                  </div>
                )}
                {job.report !== null && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer font-mono text-[10px] text-muted-foreground">reporte</summary>
                    <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/60 p-2 font-mono text-[10px] leading-tight">{JSON.stringify(job.report, null, 2)}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Separator className="hidden" />
    </div>
  )
}

// El volumen vive en el proyecto (musicVolume) y se aplica en el ensamblaje:
// persistencia vía PATCH diferida para no martillar la API en cada drag.
let volumeSaveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleVolumeSave(
  patchProject: ReturnType<typeof usePatchProject>,
  projectId: string,
  volume: number,
): void {
  if (volumeSaveTimer !== null) clearTimeout(volumeSaveTimer)
  volumeSaveTimer = setTimeout(() => {
    void patchProject.mutateAsync({ id: projectId, body: { musicVolume: volume } })
  }, 600)
}
