'use client'

// AirShot — organisms/tabs/AssemblyTab (UC-08/UC-09): música opcional (upload con
// reemplazo + volumen + fade de config), ensamblar (202 + sondeo de jobs),
// historial con salida descargable, y QA de audio (Earshot, opt-in por config).

import { useRef, useState } from 'react'
import { Download, Music, Play, Trash2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { StatusChip } from '@/components/airshot/atoms'
import { useAssemble, useAssemblies, useAudioQA, useMusicMutation, usePatchProject, useRuntimeConfig, useScenes } from '@/hooks/airshot'
import type { ProjectResponse } from '@/lib/airshot-client/types'

export function AssemblyTab({ project }: { project: ProjectResponse }) {
  const runtime = useRuntimeConfig()
  const scenesQuery = useScenes(project.id)
  const assemblies = useAssemblies(project.id)
  const assemble = useAssemble()
  const audioQA = useAudioQA()
  const musicUpload = useMusicMutation('upload')
  const musicDelete = useMusicMutation('delete')
  const patchProject = usePatchProject()
  const musicInputRef = useRef<HTMLInputElement | null>(null)
  const [includeAudio, setIncludeAudio] = useState(true)
  const [volume, setVolume] = useState(project.musicVolume)
  const [qaFeatures, setQaFeatures] = useState<string[]>(['loudness', 'sync'])

  const scenes = scenesQuery.data?.pages.flatMap((page) => page.items) ?? []
  const jobs = assemblies.data?.pages.flatMap((page) => page.items) ?? []
  const missingVideo = scenes.filter((s) => s.videoClipPath === null).length
  const missingAudio = includeAudio && (runtime.data?.assembly.require_audio ?? true)
    ? scenes.filter((s) => s.audioPath === null).length
    : 0
  const canAssemble = scenes.length > 0 && missingVideo === 0 && missingAudio === 0
  const earshotEnabled = runtime.data?.audio_qa.enabled ?? false

  return (
    <div className="space-y-4">
      <Card className="p-0">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Música opcional</h3>
            {project.musicAssetKey !== null && (
              <Badge variant="secondary" className="gap-1">
                <Music className="size-3" />
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
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Ensamblaje final</h3>
            <div className="ml-auto flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">incluir narración</Label>
              <Switch checked={includeAudio} onCheckedChange={setIncludeAudio} aria-label="Incluir narración" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            FFmpeg concat de clips normalizados ({runtime.data?.assembly.output_fps ?? 24} fps) + mezcla narración/música con fade out.
          </p>
          {!canAssemble && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Pendiente para ensamblar: {missingVideo} clip(s) de vídeo{missingAudio > 0 ? ` y ${missingAudio} narración(es) (require_audio=${String(runtime.data?.assembly.require_audio ?? true)})` : ''}.
            </p>
          )}
          <Button className="gap-1" disabled={!canAssemble || assemble.isPending} onClick={() => void assemble.mutateAsync({ projectId: project.id, body: { includeAudio, musicVolume: volume } })}>
            <Play className="size-4" /> Ensamblar vídeo final
          </Button>
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">QA de audio (Earshot)</h3>
            {!earshotEnabled && <Badge variant="outline" className="text-[10px]">módulo desactivado en config</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Análisis in-process (ebur128/ffprobe): sonoridad integrada y sincronía. naturalness/artifacts no se miden localmente (se declara, no se inventa).
          </p>
          <div className="flex flex-wrap gap-3">
            {['loudness', 'sync', 'naturalness', 'artifacts'].map((feature) => (
              <label key={feature} className="flex items-center gap-1 text-xs">
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
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Historial de jobs</h3>
          {jobs.length === 0 && <p className="text-xs text-muted-foreground">Sin jobs aún.</p>}
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-md border p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={job.status} />
                  <Badge variant="outline" className="text-[10px]">{job.jobType === 'assembly' ? 'ensamblaje' : 'audio-qa'}</Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">{job.id.slice(0, 8)}…</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {new Date(job.createdAt).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'medium' })}
                  </span>
                </div>
                {job.errorMessage !== null && (
                  <p className="mt-1 text-destructive">{job.errorMessage.code}: {job.errorMessage.detail}</p>
                )}
                {job.outputUrl !== null && job.jobType === 'assembly' && (
                  <a href={job.outputUrl} download className="mt-1 inline-flex items-center gap-1 text-xs underline" target="_blank" rel="noreferrer">
                    <Download className="size-3" /> Descargar final.mp4
                  </a>
                )}
                {job.outputUrl !== null && job.jobType === 'audio_qa' && (
                  <a href={job.outputUrl} download className="mt-1 inline-flex items-center gap-1 text-xs underline" target="_blank" rel="noreferrer">
                    <Download className="size-3" /> Descargar reporte JSON
                  </a>
                )}
                {job.report !== null && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px] text-muted-foreground">reporte</summary>
                    <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/60 p-2 text-[10px] leading-tight">{JSON.stringify(job.report, null, 2)}</pre>
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
