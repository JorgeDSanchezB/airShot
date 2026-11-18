// AirShot — domain/prompt-composer.ts
// Compone el prompt EN inglés para generación de imagen/vídeo de una escena
// a partir de: promptEn de la escena + fragmento de estilo + referencias asignadas.
// Política de niveles (§2.6): basic → nombre; advanced → + descripción/atributos;
// cinematic → + identidad visual exacta de las imágenes de referencia.

import { airshotConfig } from '@/lib/airshot/config/loader'
import type { ReferenceLevel } from '@/lib/airshot/domain/enums'

export type ComposerReference = {
  name: string
  description: string | null
  attributes: Record<string, unknown>
  level: ReferenceLevel
  kind: 'subject' | 'environment'
  hasImages: boolean
}

function renderAttributes(attributes: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value)) parts.push(`${key}: ${value.join(', ')}`)
    else if (typeof value === 'object') parts.push(`${key}: ${JSON.stringify(value)}`)
    else parts.push(`${key}: ${String(value)}`)
  }
  return parts.join('; ')
}

function renderReference(ref: ComposerReference): string {
  const bits: string[] = [ref.name]
  if (ref.level === 'advanced' || ref.level === 'cinematic') {
    if (ref.description) bits.push(ref.description)
    const attrs = renderAttributes(ref.attributes)
    if (attrs) bits.push(attrs)
  }
  if (ref.level === 'cinematic' && ref.hasImages) {
    bits.push('must preserve the exact visual identity shown in the attached reference image')
  }
  return bits.join(' — ')
}

export type ComposeScenePromptInput = {
  promptEn: string
  styleFragmentEn: string | null
  references: ComposerReference[]
}

export function composeScenePrompt(input: ComposeScenePromptInput): string {
  const subjects = input.references.filter((r) => r.kind === 'subject').map(renderReference)
  const environments = input.references.filter((r) => r.kind === 'environment').map(renderReference)
  const lines: string[] = [input.promptEn]
  if (input.styleFragmentEn) lines.push(`Style: ${input.styleFragmentEn}`)
  if (subjects.length > 0) lines.push(`Consistent character references: ${subjects.join(' | ')}`)
  if (environments.length > 0) lines.push(`Consistent location references: ${environments.join(' | ')}`)
  // límite de config aplicado como recorte final declarado (clave propia, ronda B:
  // antes era prompt_max_length*8 — número mágico fuera de config)
  const limit = airshotConfig.scene.composed_prompt_max_chars
  const prompt = lines.join('\n')
  if (prompt.length > limit) {
    return `${prompt.slice(0, limit - 3)}...`
  }
  return prompt
}
