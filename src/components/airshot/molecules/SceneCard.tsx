'use client'

// AirShot — molecules/SceneCard: tarjeta de escena del storyboard.
// - promptEn editable + duración (límites de runtime-config, nunca propios)
// - narración: source/custom/voice + TTS
// - assets: imagen IA/subida, vídeo (async 202 + sondeo), descartes
// - referencias asignadas (límites scene_reference.*)
// - memo (§5.7): la tarjeta solo re-renderiza si cambia su escena/voces/refs

import React, { useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Film,
  Mic,
  Trash2,
  Upload,
  Link2,
  Save,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { DurationSlider, ErrorNotice, StatusChip } from '@/components/airshot/atoms'
import type { ProjectResponse, ReferenceResponse, RuntimeConfig, SceneResponse, VoiceInfo } from '@/lib/airshot-client/types'
import {
  useDeleteScene,
  useDeleteSceneAsset,
  useGenerateSceneAudio,
  useGenerateSceneImage,
  useGenerateSceneVideo,
  usePatchScene,
  usePutSceneReferences,
  useUploadSceneImage,
} from '@/hooks/airshot'

type Props = {
  scene: SceneResponse
  project: ProjectResponse
  config: RuntimeConfig | undefined
  voices: VoiceInfo[]
  references: ReferenceResponse[]
  onMoveUp: (() => void) | undefined
  onMoveDown: (() => void) | undefined
}

function SceneCardImpl({ scene, project, config, voices, references, onMoveUp, onMoveDown }: Props) {
  const [promptDraft, setPromptDraft] = useState<string | null>(null)
  const [customText, setCustomText] = useState<string | null>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignDraft, setAssignDraft] = useState<Array<{ referenceId: string; kind: 'subject' | 'environment' }>>(scene.references)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  const patchScene = usePatchScene()
  const deleteScene = useDeleteScene()
  const generateImage = useGenerateSceneImage()
  const uploadImage = useUploadSceneImage()
  const generateVideo = useGenerateSceneVideo()
  const generateAudio = useGenerateSceneAudio()
  const deleteAssetImage = useDeleteSceneAsset('image')
  const deleteAssetVideo = useDeleteSceneAsset('video')
  const deleteAssetAudio = useDeleteSceneAsset('audio')
  const putReferences = usePutSceneReferences()

  const min = config?.scene.min_duration_seconds ?? 4
  const max = config?.scene.max_duration_seconds ?? 15
  const maxSubjects = config?.scene_reference.max_subjects_per_scene ?? 2
  const maxEnvironments = config?.scene_reference.max_environments_per_scene ?? 2
  const promptLimit = config?.scene.prompt_max_length ?? 2000

  const promptValue = promptDraft ?? scene.promptEn ?? ''
  const narrationSource = scene.narrationSource
  const busy = scene.status.endsWith('_pending')
  const refById = new Map(references.map((r) => [r.id, r]))
  const subjectsCount = assignDraft.filter((a) => a.kind === 'subject').length
  const environmentsCount = assignDraft.filter((a) => a.kind === 'environment').length

  return (
    <Card className="p-0" id={`scene-${scene.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-mono">#{scene.orderIndex + 1}</Badge>
          <StatusChip status={scene.status} />
          {scene.imageUrl !== null && <Badge variant="secondary">img</Badge>}
          {scene.videoUrl !== null && <Badge variant="secondary">vid</Badge>}
          {scene.audioUrl !== null && <Badge variant="secondary">aud</Badge>}
          {scene.videoEffectiveSeconds !== null && scene.videoEffectiveSeconds !== scene.durationSeconds && (
            <Badge variant="outline" title="DurationMapper: duración efectiva del proveedor">vídeo: {scene.videoEffectiveSeconds}s</Badge>
          )}
          {scene.audioDurationSeconds !== null && <Badge variant="outline">narración: {scene.audioDurationSeconds.toFixed(1)}s</Badge>}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-7" disabled={onMoveUp === undefined} onClick={onMoveUp} aria-label="Subir escena">
            <ChevronUp className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" disabled={onMoveDown === undefined} onClick={onMoveDown} aria-label="Bajar escena">
            <ChevronDown className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-0">
        <ErrorNotice problem={scene.lastError} />

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">Texto original</Label>
            <p className="mt-1 line-clamp-3 rounded-md bg-muted/60 p-2 text-xs leading-relaxed">{scene.originalText}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Texto mejorado (narración base)</Label>
            <p className="mt-1 line-clamp-3 rounded-md bg-muted/60 p-2 text-xs leading-relaxed">{scene.improvedText ?? '—'}</p>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">promptEn (inglés · visual)</Label>
            <span className="font-mono text-[10px] text-muted-foreground">{promptValue.length}/{promptLimit}</span>
          </div>
          <Textarea
            value={promptValue}
            onChange={(e) => setPromptDraft(e.target.value)}
            rows={3}
            className="font-mono text-xs"
            placeholder="Prompt visual en inglés para el generador de imagen/vídeo"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={promptDraft === null || promptDraft === scene.promptEn || busy}
              onClick={() => {
                void patchScene.mutateAsync({ id: scene.id, body: { promptEn: promptDraft } })
                  .then(() => setPromptDraft(null))
              }}
            >
              <Save className="size-3" /> Guardar prompt
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Duración</Label>
              <DurationSlider
                value={scene.durationSeconds}
                min={min}
                max={max}
                onChange={(value) => {
                  void patchScene.mutateAsync({ id: scene.id, body: { durationSeconds: value } })
                }}
              />
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Imagen base</Label>
            {scene.imageUrl !== null ? (
              <img src={scene.imageUrl} alt={`Imagen base de la escena ${scene.orderIndex + 1}`} className="max-h-40 w-full rounded-md border object-cover" />
            ) : (
              <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">sin imagen base</div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => void generateImage.mutateAsync(scene.id)}>
                <ImageIcon className="size-3" /> Imagen IA
              </Button>
              <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => imageInputRef.current?.click()}>
                <Upload className="size-3" /> Subir
              </Button>
              {scene.imageBasePath !== null && (
                <Button size="sm" variant="ghost" className="gap-1 text-destructive" disabled={busy} onClick={() => void deleteAssetImage.mutateAsync(scene)}>
                  <Trash2 className="size-3" /> Descartar
                </Button>
              )}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file !== undefined) {
                  void uploadImage.mutateAsync({ id: scene.id, file })
                }
                e.target.value = ''
              }}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Clip de vídeo (image-to-video)</Label>
            {scene.videoUrl !== null ? (
              <video src={scene.videoUrl} controls className="max-h-40 w-full rounded-md border" />
            ) : (
              <div className="flex h-20 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                {scene.imageBasePath === null ? 'requiere imagen base' : 'sin clip'}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={busy || scene.imageBasePath === null}
                onClick={() => void generateVideo.mutateAsync({ id: scene.id, providerOverride: project.videoProvider ?? undefined })}
              >
                <Film className="size-3" /> Vídeo ({scene.durationSeconds}s)
              </Button>
              {scene.videoClipPath !== null && (
                <Button size="sm" variant="ghost" className="gap-1 text-destructive" disabled={busy} onClick={() => void deleteAssetVideo.mutateAsync(scene)}>
                  <Trash2 className="size-3" /> Descartar
                </Button>
              )}
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">Narración</Label>
            <Select
              value={narrationSource}
              onValueChange={(value) => {
                void patchScene.mutateAsync({ id: scene.id, body: { narrationSource: value } })
              }}
            >
              <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="improved">mejorado</SelectItem>
                <SelectItem value="original">original</SelectItem>
                <SelectItem value="custom">personalizado</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={scene.voiceId ?? '__inherit'}
              onValueChange={(value) => {
                void patchScene.mutateAsync({ id: scene.id, body: { voiceId: value === '__inherit' ? null : value } })
              }}
            >
              <SelectTrigger className="h-7 w-40 text-xs" aria-label="Voz de la escena (null = hereda del proyecto)">
                <SelectValue placeholder="voz: hereda del proyecto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inherit">hereda del proyecto</SelectItem>
                {voices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>{voice.name}{voice.description !== null ? ` · ${voice.description}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto gap-1"
              disabled={busy}
              onClick={() => void generateAudio.mutateAsync({ id: scene.id, voiceId: scene.voiceId })}
            >
              <Mic className="size-3" /> Generar narración
            </Button>
          </div>
          {narrationSource === 'custom' && (
            <div className="flex gap-2">
              <Input
                value={customText ?? scene.narrationText ?? ''}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Texto de narración personalizado"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                disabled={customText === null || customText === scene.narrationText}
                onClick={() => {
                  void patchScene.mutateAsync({ id: scene.id, body: { narrationText: customText } })
                    .then(() => setCustomText(null))
                }}
              >
                <Save className="size-3" /> Guardar
              </Button>
            </div>
          )}
          {scene.audioUrl !== null && (
            <div className="flex items-center gap-2">
              <audio src={scene.audioUrl} controls className="h-8 w-full" />
              <Button size="sm" variant="ghost" className="gap-1 text-destructive" disabled={busy} onClick={() => void deleteAssetAudio.mutateAsync(scene)}>
                <Trash2 className="size-3" />
              </Button>
            </div>
          )}
        </div>

        <Separator />

        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs text-muted-foreground">Referencias</Label>
          {scene.references.length === 0 && <span className="text-xs text-muted-foreground">sin asignar</span>}
          {scene.references.map((assignment) => {
            const ref = refById.get(assignment.referenceId)
            return (
              <Badge key={assignment.referenceId} variant="secondary" className="gap-1">
                <Link2 className="size-3" />
                {ref?.name ?? assignment.referenceId.slice(0, 8)}
                <span className="text-[10px] text-muted-foreground">{assignment.kind === 'subject' ? 'subj' : 'env'}</span>
              </Badge>
            )
          })}
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => { setAssignDraft(scene.references); setAssignOpen(true) }}>
            Asignar
          </Button>
        </div>

        <div className="flex justify-end">
          <Button size="sm" variant="ghost" className="gap-1 text-destructive" onClick={() => void deleteScene.mutateAsync(scene)}>
            <Trash2 className="size-3" /> Borrar escena
          </Button>
        </div>
      </CardContent>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Asignar referencias — escena #{scene.orderIndex + 1}</DialogTitle>
            <DialogDescription>
              Máx. {maxSubjects} personajes (subject) y {maxEnvironments} escenarios (environment) por escena. Sustituye las asignaciones actuales.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {references.length === 0 && <p className="text-xs text-muted-foreground">No hay referencias visibles; crea alguna en la pestaña Referencias o la Biblioteca global.</p>}
            {references.map((ref) => {
              const current = assignDraft.find((a) => a.referenceId === ref.id)
              return (
                <div key={ref.id} className="flex items-center gap-2 rounded-md border p-2">
                  <Checkbox
                    checked={current !== undefined}
                    onCheckedChange={(checked) => {
                      setAssignDraft((prev) => {
                        if (checked) {
                          return [...prev.filter((a) => a.referenceId !== ref.id), { referenceId: ref.id, kind: current?.kind ?? (ref.type === 'character' ? 'subject' : 'environment') }]
                        }
                        return prev.filter((a) => a.referenceId !== ref.id)
                      })
                    }}
                  />
                  <div className="flex-1">
                    <p className="text-sm">{ref.name}</p>
                    <p className="text-xs text-muted-foreground">{ref.type === 'character' ? 'personaje' : 'escenario'} · {ref.level} · {ref.libraryScope === 'global' ? 'global' : 'proyecto'} · {ref.images.length} img</p>
                  </div>
                  <Select
                    value={current?.kind ?? (ref.type === 'character' ? 'subject' : 'environment')}
                    onValueChange={(kind) => {
                      setAssignDraft((prev) => {
                        const rest = prev.filter((a) => a.referenceId !== ref.id)
                        return [...rest, { referenceId: ref.id, kind: kind as 'subject' | 'environment' }]
                      })
                    }}
                  >
                    <SelectTrigger className="h-7 w-32 text-xs" aria-label={`Tipo de asignación de ${ref.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="subject">subject</SelectItem>
                      <SelectItem value="environment">environment</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>
          <DialogFooter className="items-center gap-2">
            <span className="text-xs text-muted-foreground">subjects: {subjectsCount}/{maxSubjects} · environments: {environmentsCount}/{maxEnvironments}</span>
            <Button
              size="sm"
              disabled={subjectsCount > maxSubjects || environmentsCount > maxEnvironments}
              onClick={() => {
                void putReferences.mutateAsync({ sceneId: scene.id, items: assignDraft }).then(() => setAssignOpen(false))
              }}
            >
              Guardar asignaciones
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

export const SceneCard = React.memo(SceneCardImpl)
