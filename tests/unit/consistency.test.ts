import { describe, expect, it } from 'vitest'
import { buildConsistencyReport, type ConsistencyInput } from '@/lib/airshot/services/consistency'

const base: ConsistencyInput = {
  projectVisualSeed: null,
  hasEnvironmentRefs: true,
  scenes: [
    { id: 's1', orderIndex: 0, imageBasePath: 'a.png', audioPath: null, videoClipPath: null, seed: null, referenceIds: ['c1'] },
    { id: 's2', orderIndex: 1, imageBasePath: null, audioPath: null, videoClipPath: null, seed: 7, referenceIds: [] },
    { id: 's3', orderIndex: 2, imageBasePath: null, audioPath: null, videoClipPath: null, seed: null, referenceIds: ['c1'] },
  ],
  subjects: [
    { id: 'c1', name: 'Mara', level: 'advanced', imageCount: 2, hasPrimary: true },
    { id: 'c2', name: 'Nadir', level: 'basic', imageCount: 0, hasPrimary: false },
  ],
}

describe('buildConsistencyReport', () => {
  it('calcula cobertura y hallazgos por personaje', () => {
    const report = buildConsistencyReport(base)
    expect(report.totalScenes).toBe(3)
    expect(report.assets).toEqual({ image: 1, audio: 0, video: 0 })
    expect(report.characters[0]).toMatchObject({ scenesReferenced: 2, imageCount: 2, hasPrimary: true })
    expect(report.characters[1]).toMatchObject({ scenesReferenced: 0 })
    expect(report.score).toBe(33)
    const codes = report.findings.map((finding) => finding.code)
    expect(codes).toContain('SUBJECT_WITHOUT_IMAGES')
    expect(codes).toContain('SUBJECT_UNUSED')
    expect(codes).toContain('SCENES_WITHOUT_REFERENCES')
    expect(codes).toContain('SEED_UNSET')
  })

  it('proyecto con seed no reporta SEED_UNSET y sin personajes puntúa 100', () => {
    const report = buildConsistencyReport({
      ...base,
      projectVisualSeed: 42,
      subjects: [],
      scenes: base.scenes.map((scene) => ({ ...scene, seed: null })),
    })
    expect(report.findings.map((finding) => finding.code)).not.toContain('SEED_UNSET')
    expect(report.score).toBe(100)
    expect(report.findings.map((finding) => finding.code)).toContain('NO_SUBJECT_REFERENCES')
  })

  it('proyecto sin escenas reporta NO_SCENES', () => {
    const report = buildConsistencyReport({ projectVisualSeed: null, scenes: [], subjects: [], hasEnvironmentRefs: false })
    expect(report.findings.map((finding) => finding.code)).toEqual(['NO_SCENES'])
    expect(report.totalScenes).toBe(0)
  })
})
