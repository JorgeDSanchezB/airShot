// AirShot — services/consistency.ts
// Auditoría de consistencia (idea 7): cobertura de personajes por escena,
// material base por referencia y semillas visuales. No llama a proveedores:
// es un diagnóstico honesto de lo que falta para que el vídeo sea coherente.

import { db } from '@/lib/db'
import { getProjectOr404 } from '@/lib/airshot/services/projects'

export type ConsistencyFinding = {
  code: string
  severity: 'info' | 'warning'
  detail: string
  sceneId?: string
  referenceId?: string
}

export type ConsistencyCharacter = {
  referenceId: string
  name: string
  level: string
  imageCount: number
  hasPrimary: boolean
  scenesReferenced: number
  scenesMissing: Array<{ sceneId: string; orderIndex: number }>
}

export type ConsistencyReport = {
  generatedAt: string
  totalScenes: number
  assets: { image: number; audio: number; video: number }
  score: number
  characters: ConsistencyCharacter[]
  findings: ConsistencyFinding[]
}

export type ConsistencySceneInput = {
  id: string
  orderIndex: number
  imageBasePath: string | null
  audioPath: string | null
  videoClipPath: string | null
  seed: number | null
  referenceIds: string[]
}

export type ConsistencySubjectInput = {
  id: string
  name: string
  level: string
  imageCount: number
  hasPrimary: boolean
}

export type ConsistencyInput = {
  projectVisualSeed: number | null
  scenes: ConsistencySceneInput[]
  subjects: ConsistencySubjectInput[]
  hasEnvironmentRefs: boolean
}

export function buildConsistencyReport(input: ConsistencyInput): ConsistencyReport {
  const { scenes, subjects } = input
  const findings: ConsistencyFinding[] = []

  const characters: ConsistencyCharacter[] = subjects.map((subject) => {
    const referencing = scenes.filter((scene) => scene.referenceIds.includes(subject.id))
    return {
      referenceId: subject.id,
      name: subject.name,
      level: subject.level,
      imageCount: subject.imageCount,
      hasPrimary: subject.hasPrimary,
      scenesReferenced: referencing.length,
      scenesMissing: scenes
        .filter((scene) => !scene.referenceIds.includes(subject.id))
        .map((scene) => ({ sceneId: scene.id, orderIndex: scene.orderIndex })),
    }
  })

  if (scenes.length === 0) {
    findings.push({ code: 'NO_SCENES', severity: 'info', detail: 'El proyecto no tiene escenas todavía.' })
  }
  if (scenes.length > 0 && subjects.length === 0) {
    findings.push({ code: 'NO_SUBJECT_REFERENCES', severity: 'warning', detail: 'Sin personajes de referencia: la consistencia visual no está anclada.' })
  }

  for (const character of characters) {
    if (character.imageCount === 0) {
      findings.push({ code: 'SUBJECT_WITHOUT_IMAGES', severity: 'warning', detail: `${character.name} no tiene imágenes de referencia (solo texto).`, referenceId: character.referenceId })
    } else if (!character.hasPrimary) {
      findings.push({ code: 'SUBJECT_WITHOUT_PRIMARY', severity: 'warning', detail: `${character.name} no tiene imagen primaria marcada.`, referenceId: character.referenceId })
    }
    if (character.scenesReferenced === 0) {
      findings.push({ code: 'SUBJECT_UNUSED', severity: 'warning', detail: `${character.name} no aparece en ninguna escena.`, referenceId: character.referenceId })
    } else if (scenes.length > 1 && character.scenesReferenced < scenes.length) {
      const ratio = character.scenesReferenced / scenes.length
      findings.push({
        code: 'SUBJECT_LOW_COVERAGE',
        severity: ratio < 0.5 ? 'warning' : 'info',
        detail: `${character.name} aparece en ${character.scenesReferenced}/${scenes.length} escenas.`,
        referenceId: character.referenceId,
      })
    }
  }

  const withoutRefs = scenes.filter((scene) => scene.referenceIds.length === 0)
  if (withoutRefs.length > 0 && (subjects.length > 0 || input.hasEnvironmentRefs)) {
    findings.push({
      code: 'SCENES_WITHOUT_REFERENCES',
      severity: 'info',
      detail: `${withoutRefs.length} escena(s) sin referencias asignadas.`,
      sceneId: withoutRefs[0]?.id,
    })
  }

  const seedUnset = scenes.filter((scene) => (scene.seed ?? input.projectVisualSeed) === null).length
  if (seedUnset > 0) {
    findings.push({
      code: 'SEED_UNSET',
      severity: 'info',
      detail: `${seedUnset} escena(s) sin semilla visual (proyecto y escena vacíos): regenerar puede cambiar el resultado.`,
    })
  }

  const score = subjects.length === 0
    ? 100
    : Math.round((characters.reduce((sum, c) => sum + c.scenesReferenced / Math.max(1, scenes.length), 0) / subjects.length) * 100)

  return {
    generatedAt: new Date().toISOString(),
    totalScenes: scenes.length,
    assets: {
      image: scenes.filter((scene) => scene.imageBasePath !== null).length,
      audio: scenes.filter((scene) => scene.audioPath !== null).length,
      video: scenes.filter((scene) => scene.videoClipPath !== null).length,
    },
    score,
    characters,
    findings,
  }
}

function parseImages(raw: string): Array<{ isPrimary: boolean }> {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is { isPrimary: boolean } => typeof item === 'object' && item !== null) : []
  } catch {
    return []
  }
}

export async function getConsistency(projectId: string): Promise<ConsistencyReport> {
  const project = await getProjectOr404(projectId)
  const scenes = await db.scene.findMany({
    where: { projectId },
    orderBy: { orderIndex: 'asc' },
    select: {
      id: true,
      orderIndex: true,
      imageBasePath: true,
      audioPath: true,
      videoClipPath: true,
      seed: true,
      references: { select: { referenceId: true } },
    },
  })
  const referencedIds = [...new Set(scenes.flatMap((scene) => scene.references.map((ref) => ref.referenceId)))]
  const references = await db.reference.findMany({
    where: {
      OR: [
        { projectId },
        ...(referencedIds.length > 0 ? [{ id: { in: referencedIds } }] : []),
      ],
    },
    select: { id: true, type: true, name: true, level: true, referenceImages: true },
  })
  const subjects = references
    .filter((reference) => reference.type === 'character')
    .map((reference) => {
      const images = parseImages(reference.referenceImages)
      return {
        id: reference.id,
        name: reference.name,
        level: reference.level,
        imageCount: images.length,
        hasPrimary: images.some((image) => image.isPrimary),
      }
    })
  return buildConsistencyReport({
    projectVisualSeed: project.visualSeed,
    scenes: scenes.map((scene) => ({
      id: scene.id,
      orderIndex: scene.orderIndex,
      imageBasePath: scene.imageBasePath,
      audioPath: scene.audioPath,
      videoClipPath: scene.videoClipPath,
      seed: scene.seed,
      referenceIds: scene.references.map((ref) => ref.referenceId),
    })),
    subjects,
    hasEnvironmentRefs: references.some((reference) => reference.type === 'location'),
  })
}
