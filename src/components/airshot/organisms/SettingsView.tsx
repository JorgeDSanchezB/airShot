'use client'

// AirShot — organisms/SettingsView (Sistema): configs de proveedores agrupadas
// por tipo (upsert cifrado + prueba con latencia/lastCheck), salud profunda
// (BD, storage, ffmpeg, ffprobe, VoiceStudio, keys faltantes) y resumen de
// límites efectivos del runtime-config.

import { useState } from 'react'
import { Activity, KeyRound, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusChip } from '@/components/airshot/atoms'
import { ProviderConfigFormDialog } from '@/components/airshot/molecules/forms'
import { useHealthDeep, useProviderConfigCrud, useProviderConfigs, useRuntimeConfig } from '@/hooks/airshot'
import type { ProviderConfigResponse } from '@/lib/airshot-client/types'

const PROVIDER_TYPES = ['video', 'tts', 'llm', 'image', 'audio_qa'] as const

export function SettingsView() {
  const runtime = useRuntimeConfig()
  const [typeFilter, setTypeFilter] = useState<string>('__all')
  const configs = useProviderConfigs(typeFilter !== '__all' ? typeFilter : undefined)
  const crud = useProviderConfigCrud()
  const health = useHealthDeep(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formNonce, setFormNonce] = useState(0)
  const [editing, setEditing] = useState<ProviderConfigResponse | null>(null)

  const items = configs.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold">Sistema</h2>
          <p className="text-xs text-muted-foreground">Proveedores (API keys cifradas AES-256-GCM · solo últimos 4 chars visibles), salud e inspección de límites.</p>
        </div>
        <Button size="sm" className="ml-auto gap-1" onClick={() => { setEditing(null); setFormNonce((n) => n + 1); setDialogOpen(true) }}>
          <Plus className="size-3" /> Configurar proveedor
        </Button>
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

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((config) => (
          <Card key={config.id} className="p-0">
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-mono text-[10px]">{config.providerType}</Badge>
                <p className="text-sm font-medium">{config.providerName}</p>
                {!config.isActive && <Badge variant="secondary" className="text-[10px]">inactiva</Badge>}
                <Button size="icon" variant="ghost" className="ml-auto size-6" aria-label={`Editar ${config.providerName}`} onClick={() => { setEditing(config); setFormNonce((n) => n + 1); setDialogOpen(true) }}>
                  <KeyRound className="size-3" />
                </Button>
                <Button size="icon" variant="ghost" className="size-6 text-destructive" aria-label={`Borrar config ${config.providerName}`} onClick={() => void crud.remove.mutateAsync(config.id)}>
                  <Trash2 className="size-3" />
                </Button>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p><span className="font-mono">key:</span> {config.apiKeyMasked ?? '— (sin key)'}</p>
                <p className="truncate"><span className="font-mono">baseUrl:</span> {config.baseUrl ?? 'default del registro'}</p>
                {config.lastCheck !== null && (
                  <p className="flex items-center gap-1">
                    <Activity className="size-3" />
                    lastCheck: {config.lastCheck.ok ? `OK ${config.lastCheck.latencyMs}ms` : `fallo (${config.lastCheck.error?.code ?? '?'})`}
                    <span className="text-[10px]">· {new Date(config.lastCheck.checkedAt).toLocaleTimeString()}</span>
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
        ))}
      </div>
      {items.length === 0 && !configs.isLoading && (
        <p className="text-xs text-muted-foreground">
          Sin configs guardadas. Los proveedores con auth=env/none (zai, ffmpeg-kenburns, voicestudio, earshot) funcionan sin key; los externos (veo, kling, runway, luma, elevenlabs, openai_compat) la exigen (409 si falta).
        </p>
      )}

      <Card className="p-0">
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Salud (deep)</h3>
          {health.isLoading && <p className="text-xs text-muted-foreground">Comprobando…</p>}
          {health.data !== undefined && (
            <div className="space-y-1">
              {health.data.checks.map((check) => (
                <div key={check.name} className="flex items-center gap-2 text-xs">
                  <StatusChip status={check.ok ? 'completed' : 'failed'} />
                  <span className="font-mono">{check.name}</span>
                  <span className="truncate text-muted-foreground">{check.detail}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="space-y-2 p-4">
          <h3 className="text-sm font-semibold">Límites efectivos (GET /config)</h3>
          {runtime.data !== undefined && (
            <div className="grid gap-x-6 gap-y-1 text-xs md:grid-cols-2">
              <p><span className="font-mono">scene.duration:</span> {runtime.data.scene.min_duration_seconds}–{runtime.data.scene.max_duration_seconds}s (def. {runtime.data.scene.default_duration_seconds}s)</p>
              <p><span className="font-mono">scene.max_scenes:</span> {runtime.data.scene.max_scenes_per_project}</p>
              <p><span className="font-mono">reference.max_images:</span> {runtime.data.reference.max_images_per_reference}</p>
              <p><span className="font-mono">reference.attributes:</span> ≤{runtime.data.reference.attributes_max_fields} claves · depth ≤{runtime.data.reference.attributes_max_depth}</p>
              <p><span className="font-mono">scene_reference:</span> {runtime.data.scene_reference.max_subjects_per_scene} subj / {runtime.data.scene_reference.max_environments_per_scene} env</p>
              <p><span className="font-mono">pagination:</span> {runtime.data.pagination.default_page_size} (máx {runtime.data.pagination.max_page_size})</p>
              <p><span className="font-mono">batch_max_operations:</span> {runtime.data.app.batch_max_operations}</p>
              <p><span className="font-mono">audio_qa.earshot:</span> {runtime.data.audio_qa.enabled ? 'activado' : 'desactivado'}</p>
              <p><span className="font-mono">proveedores video:</span> {runtime.data.providers.video.join(', ')}</p>
              <p><span className="font-mono">proveedores tts:</span> {runtime.data.providers.tts.join(', ')}</p>
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
