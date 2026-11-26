'use client'

// AirShot — organisms/ProjectsView: hero editorial + monitor de proyección
// (signature moment: timecode vivo 24fps + playhead) + pipeline full-bleed +
// lista infinita de proyectos con entrada escalonada (framer-motion).

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Clapperboard, Download, Film, LayoutGrid, MoveDiagonal, Plus, Trash2, Upload, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, StatusChip } from '@/components/airshot/atoms'
import { ProjectFormDialog } from '@/components/airshot/molecules/forms'
import { useDeleteProject, useExportProject, useImportProject, useProjects, useStyles, useVoices, useRuntimeConfig } from '@/hooks/airshot'
import { useWorkspace } from '@/stores/workspace'

const PIPELINE: Array<{ step: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { step: '01', label: 'Historia', icon: Wand2 },
  { step: '02', label: 'Storyboard', icon: LayoutGrid },
  { step: '03', label: 'Escenas IA', icon: Clapperboard },
  { step: '04', label: 'Ensamblaje', icon: Film },
]

/* segmentos decorativos de una tira de escenas */
const SCENE_SEGMENTS = [18, 12, 22, 9, 26, 13]
const LOOP_SECONDS = 12

function ProjectorMonitor({ sceneCount }: { sceneCount: number | null }) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setFrame((f) => f + 1), 1000 / 24)
    return () => window.clearInterval(id)
  }, [])

  const totalSeconds = frame / 24
  const pad = (n: number) => String(n).padStart(2, '0')
  const timecode = `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor((totalSeconds / 60) % 60))}:${pad(Math.floor(totalSeconds % 60))}:${pad(frame % 24)}`
  const progress = ((totalSeconds % LOOP_SECONDS) / LOOP_SECONDS) * 100
  const segments = SCENE_SEGMENTS.slice(0, Math.max(sceneCount ?? SCENE_SEGMENTS.length, 1))

  return (
    <div
      aria-hidden
      className="relative aspect-[16/10] w-full select-none overflow-hidden rounded-xl border border-white/15 bg-[oklch(0.13_0.012_58)] shadow-[0_24px_60px_-24px] shadow-black/50 dark:shadow-black/70 dark:ring-1 dark:ring-primary/15"
    >
      {/* halo de proyector */}
      <div className="absolute inset-0 bg-[radial-gradient(75%_120%_at_50%_120%,oklch(0.76_0.165_62/0.32),transparent_65%)]" />
      {/* scanlines de CRT */}
      <div className="absolute inset-0 bg-[repeating-linear-gradient(180deg,transparent_0px,transparent_2px,rgba(255,255,255,0.05)_2px,rgba(255,255,255,0.05)_4px)]" />
      {/* marcas de encuadre */}
      <span className="absolute left-3 top-3 size-4 border-l-2 border-t-2 border-white/25" />
      <span className="absolute right-3 top-3 size-4 border-r-2 border-t-2 border-white/25" />
      <span className="absolute bottom-3 left-3 size-4 border-b-2 border-l-2 border-white/25" />
      <span className="absolute bottom-3 right-3 size-4 border-b-2 border-r-2 border-white/25" />

      {/* HUD */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-8 py-3 font-mono text-[10px] tracking-widest text-white/70">
        <span className="flex items-center gap-2">
          <span className="pulse-dot size-2 rounded-full bg-red-500" />
          REC
        </span>
        <span>CAM 01 · 24 FPS · ISO 800</span>
      </div>

      {/* timecode */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="slug font-mono text-2xl font-semibold tracking-[0.18em] text-primary [text-shadow:0_0_18px_oklch(0.76_0.165_62/0.55)] sm:text-3xl">
          {timecode}
        </span>
      </div>

      {/* tira de escenas + playhead */}
      <div className="absolute inset-x-0 bottom-0 px-8 pb-5">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="flex h-full gap-1">
            {segments.map((w, i) => (
              <span key={i} className="h-full rounded-[2px] bg-white/25" style={{ width: `${w}%` }} />
            ))}
          </div>
          <span
            className="absolute top-0 h-full w-px bg-primary [box-shadow:0_0_10px_0_currentColor]"
            style={{ left: `${progress}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[9px] tracking-widest text-white/40">
          <span>TIRA · {sceneCount ?? segments.length} ESCENAS</span>
          <span>A001_C001</span>
        </div>
      </div>
    </div>
  )
}

function Hero({ onCreate, sceneCount }: { onCreate: () => void; sceneCount: number | null }) {
  return (
    <section className="projector-glow relative overflow-hidden rounded-2xl border bg-card/50 pb-0">
      <div className="grid gap-10 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-foreground/70">
            estudio de cine local · single-user · IA
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.4rem]">
            Tus historias,
            <br />
            convertidas en <em className="font-serif font-normal italic text-primary">película</em>
            <span className="text-primary">.</span>
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Pega una historia y AirShot la mejora con LLM, la corta en escenas, genera imagen, vídeo y
            narración con IA, y ensambla el metraje final con FFmpeg — todo en tu máquina.
          </p>
          <div className="mt-7 flex flex-col items-start gap-3">
            <Button size="lg" onClick={onCreate} className="w-fit gap-2 shadow-[0_8px_24px_-8px] shadow-primary/50">
              <Plus className="size-4" /> Nuevo proyecto
            </Button>
            <span className="w-fit rounded-full border bg-card/80 px-3 py-1.5 font-mono text-[10px] text-muted-foreground">
              sin nube · sin cola · assets en ./data
            </span>
          </div>
        </div>
        <ProjectorMonitor sceneCount={sceneCount} />
      </div>

      <ol
        className="flex flex-wrap items-center gap-x-8 gap-y-2 border-t px-6 py-4 sm:px-10"
        aria-label="Pipeline de producción"
      >
        {PIPELINE.map((phase, i) => (
          <li key={phase.step} className="flex items-center gap-2.5">
            <span className="slug font-mono text-[10px] font-semibold text-primary">{phase.step}</span>
            <phase.icon className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="text-xs font-medium">{phase.label}</span>
            {i < PIPELINE.length - 1 && (
              <span className="ml-3 hidden size-1 rounded-full bg-border sm:block" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
}

export function ProjectsView() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useProjects()
  const runtime = useRuntimeConfig()
  const styles = useStyles()
  const voices = useVoices()
  const openProject = useWorkspace((s) => s.openProject)
  const deleteProject = useDeleteProject()
  const exportProject = useExportProject()
  const importProject = useImportProject()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const includeMedia = runtime.data?.transfer.include_media_default ?? true

  const projects = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="space-y-8">
      <Hero onCreate={() => setCreateOpen(true)} sceneCount={projects[0]?.sceneCount ?? null} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold tracking-tight">Proyectos</h2>
        <div className="flex items-center gap-3">
          <span className="slug font-mono text-[10px] text-muted-foreground">
            {isLoading ? 'cargando…' : `${projects.length}${hasNextPage ? '+' : ''} en el estudio`}
          </span>
          <input
            ref={importInputRef}
            type="file"
            accept=".airshot,application/zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file !== undefined) {
                void importProject.mutateAsync(file).then((result) => openProject(result.projectId))
              }
              e.target.value = ''
            }}
          />
          <Button size="sm" variant="outline" className="gap-1" disabled={importProject.isPending} onClick={() => importInputRef.current?.click()}>
            <Upload className="size-3" /> {importProject.isPending ? 'Importando…' : 'Importar .airshot'}
          </Button>
        </div>
      </div>

      {isError && <p className="text-sm text-destructive">No se pudo listar proyectos.</p>}
      {!isLoading && projects.length === 0 && (
        <EmptyState label="Sin proyectos todavía" hint="Crea el primero con «Nuevo proyecto» y pega tu historia." />
      )}

      <motion.div
        variants={gridVariants}
        initial="hidden"
        animate="show"
        className="grid gap-5 md:grid-cols-2 xl:grid-cols-3"
      >
        {projects.map((project) => (
          <motion.div
            key={project.id}
            variants={cardVariants}
            className="h-full cursor-pointer outline-offset-2"
            onClick={() => openProject(project.id)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openProject(project.id)
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`Abrir «${project.title}» en el estudio`}
          >
            <Card className="group elevate-hover h-full p-0 hover:border-primary/40">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-base font-semibold leading-snug tracking-tight underline-offset-4 decoration-primary/40 group-hover:underline">
                    {project.title}
                  </p>
                  <StatusChip status={project.status} />
                </div>

                <p className="flex w-fit items-center gap-1.5 text-[11px] text-muted-foreground transition-colors group-hover:text-primary">
                  <MoveDiagonal className="size-3" aria-hidden />
                  abrir estudio
                </p>

                <div className="mt-auto space-y-3">
                  <div className="slug flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-dashed pt-3 font-mono text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Film className="size-3" aria-hidden />
                      {project.sceneCount} escenas
                    </span>
                    <span>{project.videoProvider ?? 'sin proveedor'}</span>
                    <span>{project.outputResolution}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(project.createdAt), { addSuffix: true, locale: es })}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        disabled={exportProject.isPending}
                        title={includeMedia ? 'Incluye imágenes, clips, narración y música' : 'Solo estructura (sin media)'}
                        onClick={(e) => {
                          e.stopPropagation()
                          void exportProject.mutateAsync({ id: project.id, includeMedia })
                        }}
                      >
                        <Download className="size-3" /> .airshot
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-destructive opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm(`¿Borrar «${project.title}» y todos sus assets?`)) {
                            void deleteProject.mutateAsync(project.id)
                          }
                        }}
                      >
                        <Trash2 className="size-3" /> Borrar
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
          </Button>
        </div>
      )}

      <ProjectFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        config={runtime.data}
        styles={styles.data?.pages.flatMap((p) => p.items) ?? []}
        voices={voices.data?.pages.flatMap((p) => p.items) ?? []}
      />
    </div>
  )
}
