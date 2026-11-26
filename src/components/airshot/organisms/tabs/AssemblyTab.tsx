'use client'

// AirShot — organisms/tabs/AssemblyTab (UC-08/UC-09): música opcional (upload con
// reemplazo + volumen + fade de config), ensamblar (202 + sondeo de jobs),
// historial con salida descargable, y QA de audio (Earshot, opt-in por config).

import { useRef, useState } from 'react'
import { AudioLines, Download, Film, Image as ImageIcon, Languages, Music, Package, Play, RotateCcw, Trash2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { StatusChip } from '@/components/airshot/atoms'
import { useAssemble, useAssemblies, useAudioQA, useDeleteLanguage, useLanguageAudio, useLanguages, useMusicMutation, usePatchProject, usePublish, useRetryAssembly, useRuntimeConfig, useScenes, useTranslateProject } from '@/hooks/airshot'
import type { ProjectResponse, PublishResult } from '@/lib/airshot-client/types'

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
  const publish = usePublish(project.id)
  const languages = useLanguages(project.id)
  const translate = useTranslateProject(project.id)
  const languageAudio = useLanguageAudio(project.id)
  const deleteLanguage = useDeleteLanguage(project.id)
  const [published, setPublished] = useState<PublishResult | null>(null)
  const [newLanguage, setNewLanguage] = useState('')
  const [audioLanguage, setAudioLanguage] = useState('__base')
  const [subtitleLanguages, setSubtitleLanguages] = useState<string[]>([])
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
  const missingVideo = scenes.filter((s) => s.videoClipPath === null && s.imageBasePath === null).length
  const missingAudio = includeAudio && (runtime.data?.assembly.require_audio ?? true)
    ? scenes.filter((s) => s.audioPath === null).length
    : 0
  const canAssemble = scenes.length > 0 && missingVideo === 0 && missingAudio === 0 && aspectValue.length > 0
  const earshotEnabled = runtime.data?.audio_qa.enabled ?? false
  // salida más reciente del ensamblaje (presentación: reproductor final)
  const latestOutput = jobs.find((job) => job.jobType === 'assembly' && job.outputUrl !== null)?.outputUrl ?? null
  const languageItems = languages.data?.items ?? []
  const selectedAudioLanguage = audioLanguage === '__base' ? null : audioLanguage
  const audioLanguageReady = selectedAudioLanguage === null
    || languageItems.some((item) => item.language === selectedAudioLanguage && item.totalScenes > 0 && item.audioReady === item.totalScenes)
  const languageDraft = newLanguage.trim()
  const languageDraftValid = /^[a-z]{2}(-[A-Z]{2})?$/.test(languageDraft)
    && !languageItems.some((item) => item.language === languageDraft)
    && languageItems.length < (runtime.data?.translation?.max_languages ?? 4)

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
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">llm · tts · srt por idioma</p>
            <h3 className="mt-1.5 font-display text-base font-semibold tracking-tight">Doblaje multi-idioma</h3>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            traduce el texto de narración de cada escena y genera su voz; el ensamblaje puede usar ese audio como narración y exportar un SRT por idioma.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newLanguage}
              onChange={(e) => setNewLanguage(e.target.value.replace(/[^a-zA-Z-]/g, ''))}
              placeholder="idioma ISO (en, fr, pt-BR)"
              className="h-8 w-48 text-xs"
              aria-label="Código de idioma a traducir"
            />
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={!languageDraftValid || translate.isPending || scenes.length === 0}
              onClick={() => {
                void translate.mutateAsync({ languages: [languageDraft] }).then(() => setNewLanguage(''))
              }}
            >
              <Languages className="size-3" /> {translate.isPending ? 'Traduciendo…' : 'Traducir'}
            </Button>
            <span className="slug font-mono text-[10px] text-muted-foreground">
              {languageItems.length}/{runtime.data?.translation?.max_languages ?? 4} idiomas · {scenes.length} escenas
            </span>
          </div>
          {languageItems.length === 0 && (
            <p className="text-xs text-muted-foreground">Sin idiomas todavía. Añade un código ISO 639-1 (p. ej. <span className="font-mono">en</span>) y traduce con el LLM del proyecto.</p>
          )}
          <div className="space-y-2">
            {languageItems.map((item) => (
              <div key={item.language} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-xs">
                <Badge variant="outline" className="font-mono text-[10px] uppercase">{item.language}</Badge>
                <span className="font-mono text-[10px] text-muted-foreground">
                  texto {item.scenes}/{item.totalScenes} · voces {item.audioReady}/{item.totalScenes}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-6 gap-1 px-2 text-[10px]"
                  disabled={languageAudio.isPending}
                  onClick={() => void languageAudio.mutateAsync({ language: item.language, regenerate: item.audioReady > 0 })}
                >
                  <AudioLines className="size-3" /> {item.audioReady > 0 ? 'Regenerar voces' : 'Generar voces'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 gap-1 px-2 text-[10px] text-destructive"
                  disabled={deleteLanguage.isPending}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar el idioma «${item.language}» (texto y audios)?`)) {
                      void deleteLanguage.mutateAsync(item.language).then(() => {
                        setSubtitleLanguages((prev) => prev.filter((language) => language !== item.language))
                        if (audioLanguage === item.language) setAudioLanguage('__base')
                      })
                    }
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
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
            {languageItems.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                narración
                <Select value={audioLanguage} onValueChange={setAudioLanguage}>
                  <SelectTrigger className="h-7 w-36 text-xs" aria-label="Idioma de la narración"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__base">base del proyecto</SelectItem>
                    {languageItems.map((item) => (
                      <SelectItem key={item.language} value={item.language}>
                        {item.language}{item.audioReady === item.totalScenes ? ' ✓' : ` (voz ${item.audioReady}/${item.totalScenes})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}
          </div>
          {languageItems.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">SRT por idioma:</span>
              {languageItems.map((item) => (
                <label key={item.language} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
                  <Checkbox
                    checked={subtitleLanguages.includes(item.language)}
                    onCheckedChange={(checked) => {
                      setSubtitleLanguages((prev) => (checked ? [...prev, item.language] : prev.filter((language) => language !== item.language)))
                    }}
                  />
                  {item.language}
                </label>
              ))}
            </div>
          )}
          {!audioLanguageReady && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              La narración en «{selectedAudioLanguage}» no tiene voces en todas las escenas ({languageItems.find((item) => item.language === selectedAudioLanguage)?.audioReady ?? 0}/{languageItems.find((item) => item.language === selectedAudioLanguage)?.totalScenes ?? scenes.length}). Genera las voces del idioma o vuelve a la narración base.
            </p>
          )}
          {!canAssemble && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Pendiente para ensamblar: {missingVideo} escena(s) sin imagen ni clip{missingAudio > 0 ? ` y ${missingAudio} narración(es) (require_audio=${String(runtime.data?.assembly.require_audio ?? true)})` : ''}.
            </p>
          )}
          <Button
            className="gap-1 shadow-[0_8px_24px_-8px] shadow-primary/40"
            disabled={!canAssemble || !audioLanguageReady || assemble.isPending}
            onClick={() => void assemble.mutateAsync({
              projectId: project.id,
              body: {
                includeAudio,
                musicVolume: volume,
                aspect: aspectValue,
                subtitles: subtitlesMode,
                duckMusic,
                coverSceneId: coverSceneId === 'none' ? null : coverSceneId,
                audioLanguage: selectedAudioLanguage,
                subtitleLanguages,
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
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">zip · vídeo + srt + portada + metadatos</p>
            <h3 className="mt-1.5 font-display text-base font-semibold tracking-tight">Paquete de publicación</h3>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            empaqueta los ensamblajes completados (una variante por proporción) sin re-renderizar; los metadatos salen del LLM o de una plantilla (se indica la fuente).
          </p>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            disabled={latestOutput === null || publish.isPending}
            onClick={() => {
              void publish.mutateAsync({ metadata: true }).then(setPublished)
            }}
          >
            <Package className="size-3" /> {publish.isPending ? 'Empaquetando…' : 'Generar paquete'}
          </Button>
          {latestOutput === null && (
            <p className="text-xs text-muted-foreground">Requiere al menos un ensamblaje completado.</p>
          )}
          {published !== null && (
            <div className="space-y-1.5 rounded-md border p-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <a href={published.url} download className="inline-flex items-center gap-1 underline underline-offset-2" target="_blank" rel="noreferrer">
                  <Download className="size-3" /> Descargar paquete ({(published.sizeBytes / 1024 / 1024).toFixed(1)} MB)
                </a>
                {published.aspects.map((item) => (
                  <Badge key={item} variant="outline" className="font-mono text-[10px]">{item}</Badge>
                ))}
                <Badge variant="outline" className="font-mono text-[10px]" title={published.metadata.source === 'llm' ? 'generado por el LLM configurado' : 'fallback sin LLM: texto derivado del proyecto'}>
                  metadatos: {published.metadata.source === 'llm' ? 'LLM' : 'plantilla'}
                </Badge>
              </div>
              <p className="font-medium">{published.metadata.title}</p>
              <p className="text-muted-foreground">{published.metadata.description}</p>
              {published.metadata.hashtags.length > 0 && (
                <p className="font-mono text-[10px] text-muted-foreground">{published.metadata.hashtags.join(' ')}</p>
              )}
              <p className="truncate font-mono text-[10px] text-muted-foreground" title={published.key}>{published.key}</p>
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
                      <>
                        <a href={job.subtitlesUrl} download className="inline-flex items-center gap-1 text-xs underline underline-offset-2" target="_blank" rel="noreferrer">
                          <Download className="size-3" /> subtítulos.srt
                        </a>
                        {job.subtitlesMethod !== null && (
                          <Badge variant="outline" className="font-mono text-[10px]" title={job.subtitlesMethod === 'whisper' ? 'alineado con whisper local' : job.subtitlesMethod === 'mixed' ? 'alineación parcial: algunas escenas usan duración estimada' : 'tiempos estimados por duración de escena'}>
                            {job.subtitlesMethod === 'whisper' ? 'alineado' : job.subtitlesMethod === 'mixed' ? 'alineación parcial' : 'estimado'}
                          </Badge>
                        )}
                      </>
                    )}
                    {job.subtitlesTracks.map((track) => (
                      <a key={track.language} href={track.url} download className="inline-flex items-center gap-1 text-xs underline underline-offset-2" target="_blank" rel="noreferrer">
                        <Download className="size-3" /> subtítulos.{track.language}.srt
                      </a>
                    ))}
                    {job.audioLanguage !== null && (
                      <Badge variant="outline" className="font-mono text-[10px]" title="narración doblada de este job">doblaje {job.audioLanguage}</Badge>
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
