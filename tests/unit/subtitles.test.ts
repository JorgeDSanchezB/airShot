import { describe, expect, it } from 'vitest'
import { buildSrt, type AssemblySceneInput } from '@/lib/airshot/infrastructure/assembly'
import { cuesFromWhisperJson } from '@/lib/airshot/infrastructure/alignment'

const base = {
  videoClipPath: 'v.mp4',
  imagePath: null,
  audioPath: null,
  durationSeconds: 2,
  trimStartSeconds: 0,
  subtitleText: 'texto estimado',
  translations: {},
} satisfies Omit<AssemblySceneInput, 'sceneId' | 'subtitleText'> & { subtitleText: string }

describe('buildSrt con alineación', () => {
  it('usa offsets alineados y compensa el cursor de cada escena', () => {
    const scenes: AssemblySceneInput[] = [
      { ...base, sceneId: 'a', subtitleText: 'primera' },
      { ...base, sceneId: 'b', subtitleText: 'segunda' },
    ]
    const cues = new Map([
      ['a', [{ startSeconds: 0.25, endSeconds: 1.5, text: 'primera' }]],
      ['b', [{ startSeconds: 0.5, endSeconds: 1.25, text: 'segunda' }]],
    ])
    const srt = buildSrt(scenes, cues)
    expect(srt).toContain('00:00:00,250 --> 00:00:01,500')
    expect(srt).toContain('00:00:02,500 --> 00:00:03,250')
    expect(srt).not.toContain('00:00:02,000 --> 00:00:04,000')
  })

  it('cae a la duración de escena para escenas sin cues', () => {
    const scenes: AssemblySceneInput[] = [
      { ...base, sceneId: 'a' },
      { ...base, sceneId: 'b', subtitleText: 'sin alinear' },
    ]
    const srt = buildSrt(scenes, new Map([['a', [{ startSeconds: 0.2, endSeconds: 1, text: 'primera' }]]]))
    expect(srt).toContain('00:00:00,200 --> 00:00:01,000')
    expect(srt).toContain('00:00:02,000 --> 00:00:04,000')
    expect(srt).toContain('sin alinear')
  })

  it('clampa cues fuera de la duración y descarta rangos vacíos', () => {
    const scenes: AssemblySceneInput[] = [{ ...base, sceneId: 'a' }]
    const cues = new Map([['a', [
      { startSeconds: 1.5, endSeconds: 9, text: 'larga' },
      { startSeconds: 1.9, endSeconds: 1.9, text: 'vacía' },
    ]]])
    const srt = buildSrt(scenes, cues)
    expect(srt).toContain('00:00:01,500 --> 00:00:02,000')
    expect(srt).not.toContain('vacía')
  })
})

describe('pistas SRT por idioma', () => {
  it('usa el texto traducido de la escena y omite escenas sin traducción', () => {
    const scenes: AssemblySceneInput[] = [
      { ...base, sceneId: 'a', subtitleText: 'hola', translations: { en: 'hello' } },
      { ...base, sceneId: 'b', subtitleText: 'sin traducir', translations: {} },
      { ...base, sceneId: 'c', subtitleText: 'adios', translations: { en: 'bye' } },
    ]
    const srt = buildSrt(scenes.map((scene) => ({ ...scene, subtitleText: scene.translations.en ?? null })), null)
    expect(srt).toContain('hello')
    expect(srt).toContain('bye')
    expect(srt).not.toContain('sin traducir')
    expect(srt).toContain('00:00:04,000 --> 00:00:06,000')
  })
})

describe('cuesFromWhisperJson', () => {
  it('parsea offsets de whisper.cpp (ms)', () => {
    const cues = cuesFromWhisperJson({
      transcription: [{ text: ' hola mundo', offsets: { from: 120, to: 980 } }],
    }, 2, 48)
    expect(cues).toEqual([{ startSeconds: 0.12, endSeconds: 0.98, text: 'hola mundo' }])
  })

  it('parsea segmentos en segundos (faster-whisper) y recorta a la duración', () => {
    const cues = cuesFromWhisperJson({ segments: [{ text: 'hola', start: 0.5, end: 4 }] }, 1.5, 48)
    expect(cues).toEqual([{ startSeconds: 0.5, endSeconds: 1.5, text: 'hola' }])
  })

  it('parte segmentos largos proporcionalmente por palabras', () => {
    const cues = cuesFromWhisperJson({
      transcription: [{ text: 'uno dos tres cuatro cinco seis', offsets: { from: 0, to: 6000 } }],
    }, 6, 12)
    expect(cues.length).toBeGreaterThan(1)
    expect(cues.every((c) => c.text.length <= 12)).toBe(true)
    expect(cues[0].startSeconds).toBe(0)
    expect(cues[cues.length - 1].endSeconds).toBeCloseTo(6, 5)
  })
})
