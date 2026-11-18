'use client'

// AirShot — molecules/forms.tsx: ProjectForm (crear proyecto con settings),
// ReferenceForm (atributos dinámicos F4), StyleForm, ProviderConfigForm.
// Los formularios resetean por REMOUNT (key del padre), no por efectos con
// setState (react-hooks/set-state-in-effect); los defaults de config se
// resuelven como fallback en render (estado null ⇒ default de runtime-config).

import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { ProviderConfigResponse, ReferenceResponse, RuntimeConfig, VisualStyleResponse, VoiceInfo } from '@/lib/airshot-client/types'
import { useCreateProject, useProviderConfigCrud, useReferenceCrud, useStyleCrud } from '@/hooks/airshot'

// ---------------------------------------------------------------- ProjectForm

export function ProjectFormDialog({
  open,
  onOpenChange,
  config,
  styles,
  voices,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: RuntimeConfig | undefined
  styles: VisualStyleResponse[]
  voices: VoiceInfo[]
}) {
  const createProject = useCreateProject()
  const defaultVideo = config?.providers.defaults.default_video ?? 'ffmpeg-kenburns'
  const defaultTts = config?.providers.defaults.default_tts ?? 'zai'
  const [title, setTitle] = useState('')
  const [story, setStory] = useState('')
  const [videoProvider, setVideoProvider] = useState<string | null>(null)
  const [ttsProvider, setTtsProvider] = useState<string | null>(null)
  const [styleId, setStyleId] = useState<string>('__none')
  const [resolution, setResolution] = useState('720p')
  const [voiceId, setVoiceId] = useState('__default')

  const maxTitle = config?.story.max_title_length ?? 200
  const maxStory = config?.story.max_original_story_length ?? 100000

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-base">Nuevo proyecto</DialogTitle>
          <DialogDescription>Pega tu historia; el storyboard (mejora + escenas + prompts EN) se genera en el paso siguiente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="title" className="text-xs text-muted-foreground">Título</Label>
            <Input id="title" value={title} maxLength={maxTitle} onChange={(e) => setTitle(e.target.value)} placeholder="Mi historia" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="story" className="text-xs text-muted-foreground">Historia original</Label>
              <span className="slug font-mono text-[10px] text-muted-foreground">{story.length}/{maxStory}</span>
            </div>
            <Textarea id="story" value={story} rows={8} onChange={(e) => setStory(e.target.value)} placeholder="Pega aquí la historia completa…" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Proveedor de vídeo</Label>
              <Select value={videoProvider ?? defaultVideo} onValueChange={setVideoProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(config?.providers.video ?? [defaultVideo]).map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Proveedor TTS</Label>
              <Select value={ttsProvider ?? defaultTts} onValueChange={setTtsProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(config?.providers.tts ?? [defaultTts]).map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Estilo visual</Label>
              <Select value={styleId} onValueChange={setStyleId}>
                <SelectTrigger><SelectValue placeholder="sin estilo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">sin estilo</SelectItem>
                  {styles.map((style) => (
                    <SelectItem key={style.id} value={style.id}>{style.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Resolución</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs text-muted-foreground">Voz por defecto (TTS)</Label>
              <Select value={voiceId} onValueChange={setVoiceId}>
                <SelectTrigger><SelectValue placeholder="voz del proveedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default">voz del proveedor</SelectItem>
                  {voices.map((voice) => (
                    <SelectItem key={voice.id} value={voice.id}>{voice.name}{voice.description !== null ? ` · ${voice.description}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">defaults de runtime-config: {defaultVideo} · {defaultTts}</p>
        </div>
        <DialogFooter>
          <Button
            disabled={title.trim().length === 0 || story.trim().length === 0 || createProject.isPending}
            onClick={() => {
              void createProject.mutateAsync({
                title,
                originalStory: story,
                settings: {
                  videoProvider: videoProvider ?? defaultVideo,
                  ttsProvider: ttsProvider ?? defaultTts,
                  ...(styleId !== '__none' ? { visualStyleId: styleId } : {}),
                  outputResolution: resolution,
                  ...(voiceId !== '__default' ? { voiceId } : {}),
                },
              }).then(() => {
                setTitle('')
                setStory('')
                onOpenChange(false)
              })
            }}
          >
            <Plus className="size-3" /> Crear proyecto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- ReferenceForm

type AttributeRow = { key: string; value: string }

export function ReferenceFormDialog({
  open,
  onOpenChange,
  config,
  scope,
  projectId,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: RuntimeConfig | undefined
  scope: 'global' | 'project'
  projectId: string | null
  editing: ReferenceResponse | null
}) {
  const crud = useReferenceCrud()
  const [type, setType] = useState<'character' | 'location'>(editing?.type ?? 'character')
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [level, setLevel] = useState<'basic' | 'advanced' | 'cinematic'>(editing?.level ?? 'basic')
  const [rows, setRows] = useState<AttributeRow[]>(
    editing !== null
      ? Object.entries(editing.attributes).map(([key, value]) => ({
        key,
        value: typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? ''),
      }))
      : [{ key: '', value: '' }],
  )

  const maxFields = config?.reference.attributes_max_fields ?? 32
  const maxValueLen = config?.reference.attributes_max_value_length ?? 200

  function buildAttributes(): Record<string, unknown> {
    const attributes: Record<string, unknown> = {}
    for (const row of rows) {
      const key = row.key.trim()
      if (key.length === 0) continue
      let value: unknown = row.value
      try {
        value = JSON.parse(row.value)
      } catch {
        value = row.value
      }
      attributes[key] = value
    }
    return attributes
  }

  const scopeLabel = scope === 'global' ? 'biblioteca global' : 'biblioteca del proyecto'
  const descriptionText = `Ámbito: ${scopeLabel}. Atributos: hasta ${maxFields} claves, patrón ^[a-z][a-zA-Z0-9]{0,31}$, valores ≤ ${maxValueLen} caracteres (se validan en servidor).`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-base">{editing !== null ? 'Editar referencia' : 'Nueva referencia'}</DialogTitle>
          <DialogDescription>{descriptionText}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'character' | 'location')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="character">personaje</SelectItem>
                  <SelectItem value="location">escenario</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nivel</Label>
              <Select value={level} onValueChange={(v) => setLevel(v as 'basic' | 'advanced' | 'cinematic')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">básico</SelectItem>
                  <SelectItem value="advanced">avanzado</SelectItem>
                  <SelectItem value="cinematic">cinemático</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ref-name" className="text-xs text-muted-foreground">Nombre</Label>
            <Input id="ref-name" value={name} maxLength={config?.reference.max_name_length ?? 200} onChange={(e) => setName(e.target.value)} placeholder="Vera" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ref-desc" className="text-xs text-muted-foreground">Descripción (opcional)</Label>
            <Textarea id="ref-desc" value={description} rows={2} maxLength={config?.reference.max_description_length ?? 2000} onChange={(e) => setDescription(e.target.value)} placeholder="Detective retirada, abrigo largo…" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Atributos dinámicos (key minúscula camelCase)</Label>
              <span className="slug font-mono text-[10px] text-muted-foreground">{rows.length}/{maxFields}</span>
            </div>
            {rows.map((row, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={row.key}
                  onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, key: e.target.value } : r)))}
                  placeholder="hairColor"
                  className="font-mono text-xs"
                />
                <Input
                  value={row.value}
                  onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, value: e.target.value } : r)))}
                  placeholder="castaño (valor escalar o JSON)"
                  className="text-xs"
                />
                <Button size="icon" variant="ghost" className="size-8" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} aria-label="Quitar atributo">
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="gap-1" disabled={rows.length >= maxFields} onClick={() => setRows((prev) => [...prev, { key: '', value: '' }])}>
              <Plus className="size-3" /> Añadir atributo
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={name.trim().length === 0}
            onClick={() => {
              const attributes = buildAttributes()
              if (editing !== null) {
                void crud.patch.mutateAsync({ id: editing.id, body: { type, name, description: description.length > 0 ? description : null, level, attributes } })
                  .then(() => onOpenChange(false))
              } else {
                void crud.create.mutateAsync({
                  type,
                  name,
                  description: description.length > 0 ? description : null,
                  libraryScope: scope,
                  ...(scope === 'project' && projectId !== null ? { projectId } : {}),
                  level,
                  attributes,
                }).then(() => onOpenChange(false))
              }
            }}
          >
            {editing !== null ? 'Guardar cambios' : 'Crear referencia'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- StyleForm

export function StyleFormDialog({ open, onOpenChange, config }: { open: boolean; onOpenChange: (open: boolean) => void; config: RuntimeConfig | undefined }) {
  const crud = useStyleCrud()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [fragment, setFragment] = useState('')
  const maxFragment = config?.visual_style.max_prompt_fragment_length ?? 1000
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-base">Nuevo estilo visual (custom)</DialogTitle>
          <DialogDescription>El fragmento se añade a los prompts EN de las escenas del proyecto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="style-name" className="text-xs text-muted-foreground">Nombre</Label>
            <Input id="style-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Golden hour documentary" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="style-desc" className="text-xs text-muted-foreground">Descripción</Label>
            <Input id="style-desc" value={description} maxLength={config?.visual_style.max_description_length ?? 500} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="style-fragment" className="text-xs text-muted-foreground">promptFragmentEn (inglés)</Label>
              <span className="slug font-mono text-[10px] text-muted-foreground">{fragment.length}/{maxFragment}</span>
            </div>
            <Textarea id="style-fragment" value={fragment} rows={3} className="font-mono text-xs" onChange={(e) => setFragment(e.target.value)} placeholder="golden hour natural light, documentary photography" />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={name.trim().length === 0 || fragment.trim().length === 0 || crud.create.isPending}
            onClick={() => {
              void crud.create.mutateAsync({ name, description: description.length > 0 ? description : null, promptFragmentEn: fragment })
                .then(() => {
                  setName('')
                  setDescription('')
                  setFragment('')
                  onOpenChange(false)
                })
            }}
          >
            Crear estilo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- ProviderConfigForm

export function ProviderConfigFormDialog({
  open,
  onOpenChange,
  config,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: RuntimeConfig | undefined
  editing: ProviderConfigResponse | null
}) {
  const crud = useProviderConfigCrud()
  const [providerType, setProviderType] = useState(editing?.providerType ?? 'video')
  const [providerName, setProviderName] = useState(editing?.providerName ?? '')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(editing?.baseUrl ?? '')
  const [editKey, setEditKey] = useState(false)

  const namesForType: Record<string, string[]> = {
    video: config?.providers.video ?? [],
    tts: config?.providers.tts ?? [],
    llm: config?.providers.llm ?? [],
    image: config?.providers.image ?? [],
    audio_qa: config?.providers.audio_qa ?? [],
  }

  const maskHint = editing !== null && editing.apiKeyMasked !== null ? `actual: ${editing.apiKeyMasked}` : 'sin key guardada'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-base">{editing !== null ? `Editar config · ${editing.providerName}` : 'Configurar proveedor'}</DialogTitle>
          <DialogDescription>
            La API key se cifra en el servidor (AES-256-GCM) y nunca se devuelve completa — solo sus últimos 4 caracteres.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {editing === null && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Tipo</Label>
                <Select value={providerType} onValueChange={(v) => { setProviderType(v); setProviderName('') }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">video</SelectItem>
                    <SelectItem value="tts">tts</SelectItem>
                    <SelectItem value="llm">llm</SelectItem>
                    <SelectItem value="image">image</SelectItem>
                    <SelectItem value="audio_qa">audio_qa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Proveedor</Label>
                <Select value={providerName} onValueChange={setProviderName}>
                  <SelectTrigger><SelectValue placeholder="registrados" /></SelectTrigger>
                  <SelectContent>
                    {(namesForType[providerType] ?? []).map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          {editing === null || editKey ? (
            <div className="space-y-1">
              <Label htmlFor="api-key" className="text-xs text-muted-foreground">API key {editing !== null ? '(vacío = conservar la actual)' : ''}</Label>
              <Input id="api-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off" />
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditKey(true)}>Cambiar API key ({maskHint})</Button>
          )}
          <div className="space-y-1">
            <Label htmlFor="base-url" className="text-xs text-muted-foreground">baseUrl (vacío = default del registro)</Label>
            <Input id="base-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.ejemplo.com/v1" className="font-mono text-xs" />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={editing === null && providerName.length === 0}
            onClick={() => {
              if (editing !== null) {
                void crud.patch.mutateAsync({
                  id: editing.id,
                  body: {
                    ...(editKey && apiKey.length > 0 ? { apiKey } : {}),
                    ...(baseUrl !== (editing.baseUrl ?? '') ? { baseUrl: baseUrl.length > 0 ? baseUrl : null } : {}),
                  },
                }).then(() => onOpenChange(false))
              } else {
                void crud.upsert.mutateAsync({
                  providerType,
                  providerName,
                  ...(apiKey.length > 0 ? { apiKey } : {}),
                  ...(baseUrl.length > 0 ? { baseUrl } : {}),
                }).then(() => onOpenChange(false))
              }
            }}
          >
            <Save className="mr-1 size-3" /> Guardar config
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
