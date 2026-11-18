'use client'

// AirShot — organisms/ProjectSettingsDialog: edición de ajustes del proyecto
// (proveedores, estilo, resolución, voz) vía PATCH con semántica ausente≠nulo.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import type { ProjectResponse } from '@/lib/airshot-client/types'
import { usePatchProject, useRuntimeConfig, useStyles, useVoices } from '@/hooks/airshot'

export function SettingsDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  project: ProjectResponse
  onSaved: () => void
}) {
  const runtime = useRuntimeConfig()
  const styles = useStyles()
  const voices = useVoices(project.ttsProvider ?? undefined)
  const patchProject = usePatchProject()
  // reset por REMOUNT (el padre pasa key que cambia al abrir) — sin setState-in-effect
  const [title, setTitle] = useState(project.title)
  const [videoProvider, setVideoProvider] = useState(project.videoProvider ?? '__unset')
  const [ttsProvider, setTtsProvider] = useState(project.ttsProvider ?? '__unset')
  const [styleId, setStyleId] = useState(project.visualStyleId ?? '__none')
  const [resolution, setResolution] = useState(project.outputResolution)
  const [voiceId, setVoiceId] = useState(project.voiceId ?? '__default')

  const styleItems = styles.data?.pages.flatMap((p) => p.items) ?? []
  const voiceItems = voices.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustes del proyecto</DialogTitle>
          <DialogDescription>Semántica PATCH: los campos no editados se conservan; los marcados «—» se envían como null (elección explícita).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="proj-title">Título</Label>
            <Input id="proj-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={runtime.data?.story.max_title_length ?? 200} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Proveedor de vídeo</Label>
              <Select value={videoProvider} onValueChange={setVideoProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset">— (sin elegir: 409 al generar)</SelectItem>
                  {(runtime.data?.providers.video ?? []).map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Proveedor TTS</Label>
              <Select value={ttsProvider} onValueChange={setTtsProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset">— (sin elegir)</SelectItem>
                  {(runtime.data?.providers.tts ?? []).map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Estilo visual</Label>
              <Select value={styleId} onValueChange={setStyleId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— (sin estilo)</SelectItem>
                  {styleItems.map((style) => (
                    <SelectItem key={style.id} value={style.id}>{style.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Resolución</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Voz por defecto</Label>
            <Select value={voiceId} onValueChange={setVoiceId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__default">voz del proveedor</SelectItem>
                {voiceItems.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={title.trim().length === 0 || patchProject.isPending}
            onClick={() => {
              void patchProject.mutateAsync({
                id: project.id,
                body: {
                  title,
                  videoProvider: videoProvider === '__unset' ? null : videoProvider,
                  ttsProvider: ttsProvider === '__unset' ? null : ttsProvider,
                  visualStyleId: styleId === '__none' ? null : styleId,
                  outputResolution: resolution,
                  voiceId: voiceId === '__default' ? null : voiceId,
                },
              }).then(() => {
                onSaved()
                onOpenChange(false)
              })
            }}
          >
            Guardar ajustes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
