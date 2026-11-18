'use client'

// AirShot — organisms/tabs/AudioTab: voz por defecto del proyecto (cadena
// escena → proyecto → default del proveedor, mostrada explícitamente) y
// generación en lote de narraciones pendientes (tope app.batch_max_operations).

import { Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useGenerateSceneAudio, usePatchProject, useRuntimeConfig, useScenes, useVoices } from '@/hooks/airshot'
import type { ProjectResponse } from '@/lib/airshot-client/types'

export function AudioTab({ project }: { project: ProjectResponse }) {
  const runtime = useRuntimeConfig()
  const scenesQuery = useScenes(project.id)
  const voices = useVoices(project.ttsProvider ?? undefined)
  const patchProject = usePatchProject()
  const generateAudio = useGenerateSceneAudio()

  const scenes = scenesQuery.data?.pages.flatMap((page) => page.items) ?? []
  const voiceItems = voices.data?.pages.flatMap((p) => p.items) ?? []
  const batchMax = runtime.data?.app.batch_max_operations ?? 8
  const pending = scenes.filter((scene) => scene.audioPath === null)

  return (
    <div className="space-y-4">
      <Card className="p-0">
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Audio del proyecto</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">Voz por defecto (heredan las escenas sin voz propia)</Label>
            <Select
              value={project.voiceId ?? '__provider'}
              onValueChange={(value) => {
                void patchProject.mutateAsync({ id: project.id, body: { voiceId: value === '__provider' ? null : value } })
              }}
            >
              <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__provider">voz por defecto del proveedor ({project.ttsProvider ?? '—'})</SelectItem>
                {voiceItems.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}{voice.description !== null ? ` · ${voice.description}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Cadena de resolución de voz: escena → proyecto → default del proveedor (documentada, no silenciosa).
          </p>
        </CardContent>
      </Card>

      <Card className="p-0">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Narraciones pendientes</h3>
            <Badge variant="secondary">{pending.length}</Badge>
            <Button
              size="sm"
              className="ml-auto gap-1"
              disabled={pending.length === 0 || generateAudio.isPending}
              onClick={() => {
                // lote acotado por app.batch_max_operations (§3.1.4): la UI no permite más
                void Promise.all(
                  pending.slice(0, batchMax).map((scene) =>
                    generateAudio.mutateAsync({ id: scene.id, voiceId: scene.voiceId }),
                  ),
                )
              }}
            >
              <Mic className="size-3" /> Generar {Math.min(pending.length, batchMax)} en lote
            </Button>
          </div>
          {pending.length > batchMax && (
            <p className="text-xs text-muted-foreground">
              Hay {pending.length} pendientes; el lote está acotado a {batchMax} por operación (app.batch_max_operations). Repite tras completar.
            </p>
          )}
          {scenes.length === 0 && <p className="text-xs text-muted-foreground">El proyecto aún no tiene escenas.</p>}
          <div className="space-y-1">
            {scenes.map((scene) => (
              <div key={scene.id} className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="font-mono">#{scene.orderIndex + 1}</Badge>
                <span className="line-clamp-1 flex-1 text-muted-foreground">
                  {scene.narrationSource === 'custom' ? (scene.narrationText ?? 'custom sin texto') : scene.narrationSource === 'original' ? scene.originalText : (scene.improvedText ?? scene.originalText)}
                </span>
                {scene.audioPath !== null ? (
                  <Badge variant="secondary">audio {scene.audioDurationSeconds !== null ? `${scene.audioDurationSeconds.toFixed(1)}s` : ''}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 py-0 text-xs"
                    disabled={generateAudio.isPending || scene.status.endsWith('_pending')}
                    onClick={() => void generateAudio.mutateAsync({ id: scene.id, voiceId: scene.voiceId })}
                  >
                    <Mic className="size-3" /> Generar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
