import { describe, expect, it } from 'vitest'
import { airshotConfig } from '@/lib/airshot/config/loader'
import { composeScenePrompt, type ComposerReference } from '@/lib/airshot/domain/prompt-composer'

const base = (over: Partial<ComposerReference> = {}): ComposerReference => ({
  name: 'Mara',
  description: 'a tall cartographer with silver hair',
  attributes: { hairColor: 'silver', eyes: 'green' },
  level: 'basic',
  kind: 'subject',
  hasImages: false,
  ...over,
})

describe('composeScenePrompt (§2.6)', () => {
  it('basic → solo nombre (sin descripción ni atributos)', () => {
    const prompt = composeScenePrompt({ promptEn: 'Mara crosses the bridge.', styleFragmentEn: null, references: [base()] })
    expect(prompt).toContain('Mara')
    expect(prompt).not.toContain('cartographer')
    expect(prompt).not.toContain('hairColor')
  })

  it('advanced → descripción + atributos', () => {
    const prompt = composeScenePrompt({
      promptEn: 'Mara crosses the bridge.',
      styleFragmentEn: null,
      references: [base({ level: 'advanced' })],
    })
    expect(prompt).toContain('cartographer')
    expect(prompt).toContain('hairColor: silver')
    expect(prompt).toContain('eyes: green')
    expect(prompt).not.toContain('exact visual identity')
  })

  it('cinematic con imágenes → añade la cláusula de identidad', () => {
    const prompt = composeScenePrompt({
      promptEn: 'Mara crosses the bridge.',
      styleFragmentEn: null,
      references: [base({ level: 'cinematic', hasImages: true })],
    })
    expect(prompt).toContain('exact visual identity')
  })

  it('cinematic sin imágenes → no inventa la cláusula', () => {
    const prompt = composeScenePrompt({
      promptEn: 'x',
      styleFragmentEn: null,
      references: [base({ level: 'cinematic', hasImages: false })],
    })
    expect(prompt).not.toContain('exact visual identity')
  })

  it('separa sujetos y entornos, e incluye estilo', () => {
    const prompt = composeScenePrompt({
      promptEn: 'Scene.',
      styleFragmentEn: 'watercolor, muted palette',
      references: [
        base({ name: 'Mara', kind: 'subject' }),
        base({ name: 'The Old Bridge', kind: 'environment', level: 'advanced' }),
      ],
    })
    expect(prompt).toContain('Style: watercolor, muted palette')
    expect(prompt).toContain('Consistent character references: Mara')
    expect(prompt).toContain('Consistent location references: The Old Bridge')
  })

  it('renderiza arrays y objetos anidados de atributos sin romper', () => {
    const prompt = composeScenePrompt({
      promptEn: 'x',
      styleFragmentEn: null,
      references: [base({ level: 'advanced', attributes: { traits: ['kind', 'tired'], face: { eyes: 'green' }, empty: null } })],
    })
    expect(prompt).toContain('traits: kind, tired')
    expect(prompt).toContain('face: {"eyes":"green"}')
    expect(prompt).not.toContain('empty')
  })

  it('respeta composed_prompt_max_chars de config con sufijo declarado', () => {
    const limit = airshotConfig.scene.composed_prompt_max_chars
    const prompt = composeScenePrompt({
      promptEn: 'x'.repeat(limit + 500),
      styleFragmentEn: null,
      references: [],
    })
    expect(prompt.length).toBe(limit)
    expect(prompt.endsWith('...')).toBe(true)
  })
})
