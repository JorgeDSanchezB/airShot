'use client'

// AirShot — molecules/ReferenceCard + AttributeRows (§4.7: el «ReferenceRenderer»
// = ReferenceCard + AttributeRows). Render dinámico de atributos:
// ausente ⇒ omitir; null ⇒ «—»; desconocido ⇒ marcado (§5.4).
// Imágenes: exactly-one primaria, upload + IA, límite de runtime-config.

import React, { useRef } from 'react'
import { ImagePlus, Sparkles, Star, Trash2, Upload, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { NullOrUnknown } from '@/components/airshot/atoms'
import type { ReferenceResponse, RuntimeConfig } from '@/lib/airshot-client/types'
import { useReferenceCrud } from '@/hooks/airshot'

/** §4.7: registro de presentación — claves conocidas con etiqueta es-LA (display only). */
const KNOWN_ATTRIBUTE_LABELS: Record<string, string> = {
  eyeColor: 'Color de ojos',
  hairColor: 'Color de pelo',
  skinTone: 'Tono de piel',
  age: 'Edad',
  build: 'Complexión',
  outfit: 'Vestimenta',
  height: 'Altura',
  distinguishingFeatures: 'Rasgos distintivos',
  personality: 'Personalidad',
  architecture: 'Arquitectura',
  era: 'Época',
  lighting: 'Iluminación',
  palette: 'Paleta',
}

/** niveles de referencia — enum técnico, etiqueta de UI en español */
const LEVEL_LABELS: Record<string, string> = {
  basic: 'básico',
  advanced: 'avanzado',
  cinematic: 'cinemático',
}

function formatValue(value: unknown): string {
  if (value === null) return '—'
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function AttributeRows({ attributes }: { attributes: Record<string, unknown> }) {
  const entries = Object.entries(attributes)
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">sin atributos</p>
  }
  return (
    <div className="space-y-1">
      {entries.map(([key, value]) => {
        const known = Object.prototype.hasOwnProperty.call(KNOWN_ATTRIBUTE_LABELS, key)
        return (
          <div key={key} className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">
              {known ? KNOWN_ATTRIBUTE_LABELS[key] : key}
            </span>
            <NullOrUnknown unknown={!known}>{formatValue(value)}</NullOrUnknown>
          </div>
        )
      })}
    </div>
  )
}

type Props = {
  reference: ReferenceResponse
  config: RuntimeConfig | undefined
  onEdit: () => void
}

function ReferenceCardImpl({ reference, config, onEdit }: Props) {
  const crud = useReferenceCrud()
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const maxImages = config?.reference.max_images_per_reference ?? 6

  return (
    <Card className="group elevate-hover h-full p-0 hover:border-primary/40">
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={reference.type === 'character' ? 'default' : 'secondary'} className="font-mono text-[10px] uppercase">
            {reference.type === 'character' ? 'personaje' : 'escenario'}
          </Badge>
          <p className="font-display text-base font-semibold tracking-tight">{reference.name}</p>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">{LEVEL_LABELS[reference.level] ?? reference.level}</Badge>
          <Badge variant="outline" className="font-mono text-[10px] uppercase">{reference.libraryScope === 'global' ? 'biblioteca global' : 'proyecto'}</Badge>
          <Button size="icon" variant="ghost" className="ml-auto size-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" onClick={onEdit} aria-label={`Editar ${reference.name}`}>
            <Pencil className="size-3" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7 text-destructive opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" onClick={() => void crud.remove.mutateAsync(reference.id)} aria-label={`Borrar ${reference.name}`}>
            <Trash2 className="size-3" />
          </Button>
        </div>
        {reference.description !== null && <p className="text-xs text-muted-foreground">{reference.description}</p>}

        <div className="border-t border-dashed pt-3">
          <AttributeRows attributes={reference.attributes} />
        </div>

        {reference.images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {reference.images.map((image) => (
              <div key={image.id} className="group/img relative overflow-hidden rounded-lg border">
                <img
                  src={image.url}
                  alt={`Imagen de ${reference.name}`}
                  className="aspect-square w-full object-cover transition-transform duration-300 group-hover/img:scale-[1.03]"
                />
                {image.isPrimary && <Star className="absolute left-1 top-1 size-3.5 fill-amber-400 text-amber-400" />}
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/60 p-0.5 opacity-0 transition-opacity group-hover/img:opacity-100">
                  {!image.isPrimary && (
                    <Button size="icon" variant="ghost" className="size-5" title="Marcar primaria" onClick={() => void crud.setPrimary.mutateAsync({ id: reference.id, imageId: image.id })}>
                      <Star className="size-3" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="size-5 text-destructive" title="Eliminar imagen" onClick={() => void crud.deleteImage.mutateAsync({ id: reference.id, imageId: image.id })}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
                <Badge variant="outline" className="absolute right-1 top-1 bg-background/80 py-0 font-mono text-[9px] uppercase">{image.source === 'ai' ? 'IA' : 'subida'}</Badge>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-dashed pt-3">
          <span className="slug font-mono text-[10px] text-muted-foreground">{reference.images.length}/{maxImages} imágenes</span>
          <Button size="sm" variant="outline" className="ml-auto gap-1" disabled={reference.images.length >= maxImages} onClick={() => imageInputRef.current?.click()}>
            <Upload className="size-3" /> Subir
          </Button>
          <Button size="sm" variant="outline" className="gap-1" disabled={reference.images.length >= maxImages} onClick={() => void crud.generateImage.mutateAsync({ id: reference.id })}>
            <Sparkles className="size-3" /> Imagen IA
          </Button>
          <ImagePlus className="hidden size-3" aria-hidden />
        </div>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file !== undefined) {
              void crud.uploadImage.mutateAsync({ id: reference.id, file })
            }
            e.target.value = ''
          }}
        />
      </CardContent>
    </Card>
  )
}

export const ReferenceCard = React.memo(ReferenceCardImpl)
