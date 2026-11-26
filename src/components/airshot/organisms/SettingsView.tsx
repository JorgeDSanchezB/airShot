'use client'

// AirShot — organisms/SettingsView (Sistema): configs de proveedores agrupadas
// por tipo (upsert cifrado + prueba con latencia/lastCheck), salud profunda
// (BD, storage, ffmpeg, ffprobe, VoiceStudio, keys faltantes) y resumen de
// límites efectivos del runtime-config.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, AudioWaveform, BrainCircuit, DatabaseBackup, HardDrive, Image, KeyRound, Mic, Plus, RotateCcw, ScanSearch, Trash2, Video } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusChip } from '@/components/airshot/atoms'
import { ProviderConfigFormDialog } from '@/components/airshot/molecules/forms'
import { useBackupDatabase, useHealthDeep, useMediaGc, useMediaReport, useOpsSummary, useProviderConfigCrud, useProviderConfigs, useRetryAssembly, useRuntimeConfig } from '@/hooks/airshot'
import type { ProviderConfigResponse } from '@/lib/airshot-client/types'

const PROVIDER_TYPES = ['video', 'tts', 'llm', 'image', 'audio_qa'] as const

/* icono decorativo por tipo de proveedor (chip cuadrado) */
const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  video: Video,
  tts: Mic,
  llm: BrainCircuit,
  image: Image,
  audio_qa: AudioWaveform,
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
}

export function SettingsView() {
  const runtime = useRuntimeConfig()
  const [typeFilter, setTypeFilter] = useState<string>('__all')
  const configs = useProviderConfigs(typeFilter !== '__all' ? typeFilter : undefined)
  const crud = useProviderConfigCrud()
  const health = useHealthDeep(true)
  const ops = useOpsSummary(true)
  const retry = useRetryAssembly()
  const backup = useBackupDatabase()
  const gc = useMediaGc()
  const [scanMedia, setScanMedia] = useState(false)
  const media = useMediaReport(scanMedia)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formNonce, setFormNonce] = useState(0)
  const [editing, setEditing] = useState<ProviderConfigResponse | null>(null)

  const items = configs.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">
            proveedores · salud · límites
          </p>
          <h2 className="mt-1.5 font-display text-xl font-semibold tracking-tight">Sistema</h2>
          <p className="mt-1 text-xs text-muted-foreground">Proveedores (API keys cifradas AES-256-GCM · solo últimos 4 chars visibles), salud e inspección de límites.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="slug font-mono text-[10px] text-muted-foreground">
            {configs.isLoading ? 'cargando…' : `${items.length}${configs.hasNextPage ? '+' : ''} ${items.length === 1 ? 'config' : 'configs'}`}
          </span>
          <Button size="sm" className="gap-1" onClick={() => { setEditing(null); setFormNonce((n) => n + 1); setDialogOpen(true) }}>
            <Plus className="size-3" /> Configurar proveedor
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-40 text-xs" aria-label="Filtrar configs por tipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">todo tipo</SelectItem>
            {PROVIDER_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <motion.div variants={gridVariants} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2">
        {items.map((config) => {
          const TypeIcon = TYPE_ICONS[config.providerType] ?? KeyRound
          return (
            <motion.div key={config.id} variants={cardVariants}>
              <Card className="group elevate-hover h-full p-0 hover:border-primary/40">
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-secondary/50 text-muted-foreground">
                      <TypeIcon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm font-medium">{config.providerName}</p>
                      <Badge variant="outline" className="mt-1 font-mono text-[10px] uppercase">{config.providerType}</Badge>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <StatusChip status={config.isActive ? 'completed' : 'failed'} />
                      <Button size="icon" variant="ghost" className="size-7" aria-label={`Editar ${config.providerName}`} onClick={() => { setEditing(config); setFormNonce((n) => n + 1); setDialogOpen(true) }}>
                        <KeyRound className="size-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-7 text-destructive opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Borrar config ${config.providerName}`} onClick={() => void crud.remove.mutateAsync(config.id)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1 border-t border-dashed pt-3 font-mono text-[10px] text-muted-foreground">
                    <p className="truncate"><span className="text-foreground/70">key:</span> {config.apiKeyMasked ?? '— (sin key)'}</p>
                    <p className="truncate"><span className="text-foreground/70">baseUrl:</span> {config.baseUrl ?? 'default del registro'}</p>
                    {config.lastCheck !== null && (
                      <p className="flex items-center gap-1 truncate">
                        <Activity className="size-3 shrink-0" aria-hidden />
                        lastCheck: {config.lastCheck.ok ? `OK ${config.lastCheck.latencyMs}ms` : `fallo (${config.lastCheck.error?.code ?? '?'})`}
                        <span className="slug">· {new Date(config.lastCheck.checkedAt).toLocaleTimeString()}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" disabled={crud.test.isPending} onClick={() => void crud.test.mutateAsync(config.id)}>
                      Probar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </motion.div>
      {items.length === 0 && !configs.isLoading && (
        <p className="text-xs text-muted-foreground">
          Sin configs guardadas. Los proveedores con auth=env/none (zai, ffmpeg-kenburns, voicestudio, earshot) funcionan sin key; los externos (veo, kling, runway, luma, elevenlabs, openai_compat) la exigen (409 si falta).
        </p>
      )}

      <Card className="p-0">
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">deep · bd / storage / ffmpeg</p>
            <h3 className="mt-1.5 font-display text-base font-semibold tracking-tight">Salud</h3>
          </div>
          {health.isLoading && <p className="text-xs text-muted-foreground">Comprobando…</p>}
          {health.data !== undefined && (
            <div>
              {health.data.checks.map((check) => (
                <div key={check.name} className="flex items-center gap-2 border-b border-dashed px-2 py-1.5 text-xs transition-colors last:border-b-0 hover:bg-secondary/50">
                  <StatusChip status={check.ok ? 'completed' : 'failed'} />
                  <span className="shrink-0 font-mono text-[10px]">{check.name}</span>
                  <span className="truncate text-muted-foreground">{check.detail}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">cola · fallos · disco · GET /ops/summary</p>
            <h3 className="mt-1.5 font-display text-base font-semibold tracking-tight">Operaciones</h3>
          </div>
          {ops.isLoading && <p className="text-xs text-muted-foreground">Cargando…</p>}
          {ops.data !== undefined && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs md:grid-cols-4">
                <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">uptime:</span> {Math.floor(ops.data.uptimeSeconds / 60)} min</p>
                <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">jobs:</span> {ops.data.jobs.pending} · {ops.data.jobs.running} · {ops.data.jobs.failed24h} failed/24h</p>
                <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">escenas *_pending:</span> {ops.data.scenes.pending}</p>
                <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50">
                  <span className="font-mono">disco:</span>{' '}
                  {ops.data.disk !== null ? `${(ops.data.disk.freeBytes / 1024 ** 3).toFixed(1)} / ${(ops.data.disk.totalBytes / 1024 ** 3).toFixed(1)} GB` : 'n/d'}
                </p>
              </div>
              {ops.data.recentFailed.length === 0 ? (
                <p className="font-mono text-[10px] text-muted-foreground">Sin jobs fallidos recientes.</p>
              ) : (
                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">fallidos recientes</p>
                  {ops.data.recentFailed.map((job) => (
                    <div key={job.id} className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-xs">
                      <StatusChip status={job.status} />
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">{job.jobType === 'assembly' ? 'ensamblaje' : 'audio-qa'}</Badge>
                      <span className="font-mono text-[10px] text-destructive">{job.code ?? 'sin código'}</span>
                      <span className="slug font-mono text-[10px] text-muted-foreground">{job.id.slice(0, 8)}… · {new Date(job.createdAt).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      <Button size="sm" variant="outline" className="ml-auto h-6 gap-1 px-2 text-[10px]" disabled={retry.isPending} onClick={() => void retry.mutateAsync(job)}>
                        <RotateCcw className="size-3" /> Reintentar
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">sqlite · media huérfana</p>
            <h3 className="mt-1.5 font-display text-base font-semibold tracking-tight">Salud de datos</h3>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            respaldo consistente con VACUUM INTO; la GC compara la BD con data/ (versiones antiguas cuentan como vivas).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="gap-1" disabled={backup.isPending} onClick={() => void backup.mutateAsync()}>
              <DatabaseBackup className="size-3" /> {backup.isPending ? 'Respaldando…' : 'Respaldar BD'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={media.isFetching}
              onClick={() => {
                if (!scanMedia) setScanMedia(true)
                else void media.refetch()
              }}
            >
              <ScanSearch className="size-3" /> {media.isFetching ? 'Analizando…' : 'Analizar media'}
            </Button>
            {media.data !== undefined && media.data.orphanFiles > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-destructive"
                disabled={gc.isPending}
                onClick={() => {
                  if (window.confirm(`¿Borrar ${media.data?.orphanFiles ?? 0} archivo(s) huérfano(s) y liberar ${formatBytes(media.data?.orphanBytes ?? 0)}?`)) {
                    void gc.mutateAsync(true)
                  }
                }}
              >
                <Trash2 className="size-3" /> Borrar huérfanos
              </Button>
            )}
          </div>
          {media.data !== undefined && (
            <div className="space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-2 py-1.5">
                <span className="flex items-center gap-1 font-mono text-[10px]"><HardDrive className="size-3" aria-hidden /> {media.data.totalFiles} archivos · {formatBytes(media.data.totalBytes)}</span>
                <span className="font-mono text-[10px] text-muted-foreground">referenciadas: {media.data.referencedKeys}</span>
                <Badge variant="outline" className="font-mono text-[10px]">{media.data.orphanFiles} huérfanos · {formatBytes(media.data.orphanBytes)}</Badge>
              </div>
              {media.data.orphans.slice(0, 8).map((orphan) => (
                <p key={orphan.key} className="flex items-center gap-2 truncate rounded px-2 font-mono text-[10px] text-muted-foreground" title={orphan.key}>
                  <span className="truncate">{orphan.key}</span>
                  <span className="ml-auto shrink-0">{formatBytes(orphan.sizeBytes)}</span>
                </p>
              ))}
              {media.data.orphanFiles === 0 && <p className="font-mono text-[10px] text-muted-foreground">sin huérfanos: la BD y data/ están sincronizadas.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="space-y-3 p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">GET /config · runtime</p>
            <h3 className="mt-1.5 font-display text-base font-semibold tracking-tight">Límites efectivos</h3>
          </div>
          {runtime.data !== undefined && (
            <div className="grid gap-x-6 gap-y-1 text-xs md:grid-cols-2">
              <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">scene.duration:</span> {runtime.data.scene.min_duration_seconds}–{runtime.data.scene.max_duration_seconds}s (def. {runtime.data.scene.default_duration_seconds}s)</p>
              <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">scene.max_scenes:</span> {runtime.data.scene.max_scenes_per_project}</p>
              <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">reference.max_images:</span> {runtime.data.reference.max_images_per_reference}</p>
              <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">reference.attributes:</span> ≤{runtime.data.reference.attributes_max_fields} claves · depth ≤{runtime.data.reference.attributes_max_depth}</p>
              <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">scene_reference:</span> {runtime.data.scene_reference.max_subjects_per_scene} subj / {runtime.data.scene_reference.max_environments_per_scene} env</p>
              <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">pagination:</span> {runtime.data.pagination.default_page_size} (máx {runtime.data.pagination.max_page_size})</p>
              <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">batch_max_operations:</span> {runtime.data.app.batch_max_operations}</p>
              <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">transfer.max_archive:</span> {formatBytes(runtime.data.transfer.max_archive_bytes)} · media por defecto {runtime.data.transfer.include_media_default ? 'sí' : 'no'}</p>
              <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">audio_qa.earshot:</span> {runtime.data.audio_qa.enabled ? 'activado' : 'desactivado'}</p>
              <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">proveedores video:</span> {runtime.data.providers.video.join(', ')}</p>
              <p className="rounded-md px-2 py-1.5 transition-colors hover:bg-secondary/50"><span className="font-mono">proveedores tts:</span> {runtime.data.providers.tts.join(', ')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <ProviderConfigFormDialog
        key={`pc-${formNonce}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        config={runtime.data}
        editing={editing}
      />
    </div>
  )
}
