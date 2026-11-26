// AirShot — domain/dto.ts
// Mapeo fila Prisma → DTO del contrato F3 (los campos JSONB se persisten como
// TEXT serializado y se rehidratan aquí; assets con URLs /api/v1/media/…).

import type { AssemblyJob, Project, ProviderConfig, Reference, Scene, VisualStyle } from '@prisma/client'
import { storage } from '@/lib/airshot/infrastructure/storage'

export type ReferenceImageEntry = {
  id: string
  storageKey: string
  isPrimary: boolean
  source: 'upload' | 'ai'
  createdAt: string
}

export type SceneReferenceDto = { referenceId: string; kind: 'subject' | 'environment' }

function parseJsonLoose<T>(raw: string | null, fallback: T): T {
  if (raw === null || raw.length === 0) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function toReferenceImages(raw: string): ReferenceImageEntry[] {
  return parseJsonLoose<ReferenceImageEntry[]>(raw, [])
}

// ---------- Project ----------

export type ProjectSummaryDto = {
  id: string
  title: string
  status: string
  videoProvider: string | null
  outputResolution: string
  sceneCount: number
  createdAt: string
  updatedAt: string
}

export type ProjectResponseDto = {
  id: string
  title: string
  originalStory: string
  improvedStory: string | null
  visualStyleId: string | null
  visualStyleName: string | null
  videoProvider: string | null
  ttsProvider: string | null
  outputFormat: string
  outputResolution: string
  voiceId: string | null
  musicAssetKey: string | null
  musicUrl: string | null
  musicVolume: number
  musicOriginalName: string | null
  musicDurationSeconds: number | null
  status: string
  sceneCount: number
  createdAt: string
  updatedAt: string
}

export function toProjectSummary(row: Project, sceneCount: number): ProjectSummaryDto {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    videoProvider: row.videoProvider,
    outputResolution: row.outputResolution,
    sceneCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toProjectResponse(row: Project, sceneCount: number, styleName: string | null): ProjectResponseDto {
  return {
    id: row.id,
    title: row.title,
    originalStory: row.originalStory,
    improvedStory: row.improvedStory,
    visualStyleId: row.visualStyleId,
    visualStyleName: styleName,
    videoProvider: row.videoProvider,
    ttsProvider: row.ttsProvider,
    outputFormat: row.outputFormat,
    outputResolution: row.outputResolution,
    voiceId: row.voiceId,
    musicAssetKey: row.musicAssetKey,
    musicUrl: storage.resolveUrl(row.musicAssetKey),
    musicVolume: row.musicVolume,
    musicOriginalName: row.musicOriginalName,
    musicDurationSeconds: row.musicDurationSeconds,
    status: row.status,
    sceneCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ---------- Scene ----------

export type SceneResponseDto = {
  id: string
  projectId: string
  orderIndex: number
  originalText: string
  improvedText: string | null
  promptEn: string | null
  durationSeconds: number
  narrationSource: string
  narrationText: string | null
  voiceId: string | null
  imageBasePath: string | null
  imageUrl: string | null
  videoClipPath: string | null
  videoUrl: string | null
  videoEffectiveSeconds: number | null
  audioPath: string | null
  audioUrl: string | null
  audioDurationSeconds: number | null
  status: string
  lastError: { code: string; title: string; detail: string; retryable: boolean } | null
  references: SceneReferenceDto[]
  createdAt: string
  updatedAt: string
}

export function toSceneResponse(row: Scene, refs: SceneReferenceDto[]): SceneResponseDto {
  return {
    id: row.id,
    projectId: row.projectId,
    orderIndex: row.orderIndex,
    originalText: row.originalText,
    improvedText: row.improvedText,
    promptEn: row.promptEn,
    durationSeconds: row.durationSeconds,
    narrationSource: row.narrationSource,
    narrationText: row.narrationText,
    voiceId: row.voiceId,
    imageBasePath: row.imageBasePath,
    imageUrl: storage.resolveUrl(row.imageBasePath),
    videoClipPath: row.videoClipPath,
    videoUrl: storage.resolveUrl(row.videoClipPath),
    videoEffectiveSeconds: row.videoEffectiveSeconds,
    audioPath: row.audioPath,
    audioUrl: storage.resolveUrl(row.audioPath),
    audioDurationSeconds: row.audioDurationSeconds,
    status: row.status,
    lastError: parseJsonLoose<SceneResponseDto['lastError']>(row.lastError, null),
    references: refs,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ---------- Reference ----------

export type ReferenceResponseDto = {
  id: string
  projectId: string | null
  type: string
  name: string
  description: string | null
  attributes: Record<string, unknown>
  libraryScope: string
  level: string
  attributesSchemaVersion: string
  images: Array<ReferenceImageEntry & { url: string }>
  createdAt: string
  updatedAt: string
}

export function toReferenceResponse(row: Reference): ReferenceResponseDto {
  const images = toReferenceImages(row.referenceImages)
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    name: row.name,
    description: row.description,
    attributes: parseJsonLoose<Record<string, unknown>>(row.attributes, {}),
    libraryScope: row.libraryScope,
    level: row.level,
    attributesSchemaVersion: row.attributesSchemaVersion,
    images: images.map((img) => ({ ...img, url: storage.resolveUrl(img.storageKey) ?? '' })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ---------- VisualStyle ----------

export type VisualStyleResponseDto = {
  id: string
  name: string
  description: string | null
  promptFragmentEn: string
  isCustom: boolean
  createdAt: string
}

export function toVisualStyleResponse(row: VisualStyle): VisualStyleResponseDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    promptFragmentEn: row.promptFragmentEn,
    isCustom: row.isCustom,
    createdAt: row.createdAt.toISOString(),
  }
}

// ---------- ProviderConfig ----------

export type ProviderConfigResponseDto = {
  id: string
  providerType: string
  providerName: string
  apiKeyMasked: string | null
  baseUrl: string | null
  defaultParams: Record<string, unknown>
  isActive: boolean
  lastCheck: { ok: boolean; latencyMs: number; error?: { code: string; detail: string }; checkedAt: string } | null
  createdAt: string
  updatedAt: string
}

export function toProviderConfigResponse(row: ProviderConfig, apiKeyMasked: string | null): ProviderConfigResponseDto {
  return {
    id: row.id,
    providerType: row.providerType,
    providerName: row.providerName,
    apiKeyMasked,
    baseUrl: row.baseUrl,
    defaultParams: parseJsonLoose<Record<string, unknown>>(row.defaultParams, {}),
    isActive: row.isActive,
    lastCheck: parseJsonLoose<ProviderConfigResponseDto['lastCheck']>(row.lastCheck, null),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// ---------- AssemblyJob ----------

export type AssemblyProgressDto = { stage: string; done: number; total: number }

export type AssemblyJobResponseDto = {
  id: string
  projectId: string
  jobType: string
  status: string
  outputPath: string | null
  outputUrl: string | null
  subtitlesUrl: string | null
  thumbnailUrl: string | null
  progress: AssemblyProgressDto | null
  report: Record<string, unknown> | null
  errorMessage: { code: string; title: string; detail: string; retryable: boolean } | null
  params: Record<string, unknown>
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

export function toAssemblyJobResponse(row: AssemblyJob): AssemblyJobResponseDto {
  return {
    id: row.id,
    projectId: row.projectId,
    jobType: row.jobType,
    status: row.status,
    outputPath: row.outputPath,
    outputUrl: storage.resolveUrl(row.outputPath),
    subtitlesUrl: storage.resolveUrl(row.subtitlesPath),
    thumbnailUrl: storage.resolveUrl(row.thumbnailPath),
    progress: parseJsonLoose<AssemblyProgressDto | null>(row.progress, null),
    report: parseJsonLoose<Record<string, unknown> | null>(row.report, null),
    errorMessage: parseJsonLoose<AssemblyJobResponseDto['errorMessage']>(row.errorMessage, null),
    params: parseJsonLoose<Record<string, unknown>>(row.params, {}),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}
