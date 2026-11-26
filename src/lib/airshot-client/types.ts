// AirShot — client/types.ts
// Espejo estricto del contrato F3 (server DTOs); sin importes de servidor.

export type AppProblem = {
  type: string
  title: string
  status: number
  detail: string
  code: string
  retryable: boolean
  instance?: string
  traceId?: string
  provider?: string
  sceneId?: string
  projectId?: string
  jobId?: string
  field?: string
  hints?: string[]
}

export type CursorPage<T> = {
  items: T[]
  nextCursor: string | null
  limit: number
}

export type ProjectSummary = {
  id: string
  title: string
  status: string
  videoProvider: string | null
  outputResolution: string
  sceneCount: number
  createdAt: string
  updatedAt: string
}

export type ProjectResponse = {
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
  visualSeed: number | null
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

export type SceneResponse = {
  id: string
  projectId: string
  orderIndex: number
  originalText: string
  improvedText: string | null
  promptEn: string | null
  durationSeconds: number
  seed: number | null
  trimStartSeconds: number | null
  trimEndSeconds: number | null
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
  references: Array<{ referenceId: string; kind: 'subject' | 'environment' }>
  createdAt: string
  updatedAt: string
}

export type SceneAssetVersion = {
  id: string
  sceneId: string
  kind: 'image' | 'video' | 'audio'
  storageKey: string
  url: string | null
  provider: string | null
  prompt: string | null
  meta: Record<string, unknown>
  createdAt: string
}

export type ReferenceImageEntryDto = {
  id: string
  storageKey: string
  isPrimary: boolean
  source: 'upload' | 'ai'
  createdAt: string
  url: string
}

export type ReferenceResponse = {
  id: string
  projectId: string | null
  type: 'character' | 'location'
  name: string
  description: string | null
  attributes: Record<string, unknown>
  libraryScope: 'global' | 'project'
  level: 'basic' | 'advanced' | 'cinematic'
  attributesSchemaVersion: string
  images: ReferenceImageEntryDto[]
  createdAt: string
  updatedAt: string
}

export type VisualStyleResponse = {
  id: string
  name: string
  description: string | null
  promptFragmentEn: string
  isCustom: boolean
  createdAt: string
}

export type ProviderConfigResponse = {
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

export type AssemblyProgress = { stage: string; done: number; total: number }

export type AssemblyJobResponse = {
  id: string
  projectId: string
  jobType: string
  status: string
  outputPath: string | null
  outputUrl: string | null
  subtitlesUrl: string | null
  subtitlesMethod: 'whisper' | 'estimated' | 'mixed' | null
  subtitlesTracks: Array<{ language: string; path: string; url: string }>
  audioLanguage: string | null
  thumbnailUrl: string | null
  progress: AssemblyProgress | null
  report: Record<string, unknown> | null
  errorMessage: { code: string; title: string; detail: string; retryable: boolean } | null
  params: Record<string, unknown>
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

export type OpsSummary = {
  uptimeSeconds: number
  jobs: { pending: number; running: number; failed24h: number }
  scenes: { pending: number }
  disk: { freeBytes: number; totalBytes: number } | null
  recentFailed: Array<{ id: string; projectId: string; jobType: string; status: string; code: string | null; createdAt: string }>
}

export type ConsistencyFinding = {
  code: string
  severity: 'info' | 'warning'
  detail: string
  sceneId?: string
  referenceId?: string
}

export type ConsistencyReport = {
  generatedAt: string
  totalScenes: number
  assets: { image: number; audio: number; video: number }
  score: number
  characters: Array<{
    referenceId: string
    name: string
    level: string
    imageCount: number
    hasPrimary: boolean
    scenesReferenced: number
    scenesMissing: Array<{ sceneId: string; orderIndex: number }>
  }>
  findings: ConsistencyFinding[]
}

export type LanguageSummary = {
  language: string
  scenes: number
  audioReady: number
  totalScenes: number
}

export type TranslationLanguagesResponse = {
  items: LanguageSummary[]
  totalScenes: number
}

export type LanguageAudioResult = {
  language: string
  generated: number
  failed: number
  audioReady: number
  totalScenes: number
  errors: Array<{ sceneId: string; code: string; detail: string }>
}

export type TransferExportResult = {
  key: string
  url: string
  sizeBytes: number
  format: 'airshot-project/1'
  includesMedia: boolean
  scenes: number
  references: number
  mediaFiles: number
}

export type TransferImportResult = {
  projectId: string
  title: string
  scenes: number
  references: number
  mediaFiles: number
  warnings: string[]
}

export type DatabaseBackupResult = {
  key: string
  url: string
  sizeBytes: number
  createdAt: string
}

export type MediaReport = {
  scannedAt: string
  totalFiles: number
  totalBytes: number
  referencedKeys: number
  orphanFiles: number
  orphanBytes: number
  orphans: Array<{ key: string; sizeBytes: number }>
}

export type MediaGcResult = MediaReport & {
  applied: boolean
  deletedFiles: number
  freedBytes: number
}

export type PublishResult = {
  key: string
  url: string
  sizeBytes: number
  aspects: string[]
  metadata: { source: 'llm' | 'template'; title: string; description: string; hashtags: string[] }
  createdAt: string
}

export type BatchStep = 'image' | 'audio' | 'video'
export type BatchRunStatus = 'running' | 'paused' | 'cancelled' | 'completed'

export type BatchRun = {
  id: string
  projectId: string
  steps: BatchStep[]
  regenerate: boolean
  status: BatchRunStatus
  total: number
  done: number
  skipped: number
  currentSceneId: string | null
  errors: Array<{ sceneId: string; step: BatchStep; code: string; detail: string }>
  startedAt: string
  finishedAt: string | null
}

export type VoiceInfo = {
  id: string
  name: string
  language: string | null
  description: string | null
}

export type RuntimeConfig = {
  app: { batch_max_operations: number }
  pagination: { default_page_size: number; max_page_size: number }
  story: { max_title_length: number; max_original_story_length: number }
  scene: {
    min_duration_seconds: number
    default_duration_seconds: number
    max_duration_seconds: number
    max_scenes_per_project: number
    prompt_max_length: number
  }
  scene_reference: { max_subjects_per_scene: number; max_environments_per_scene: number }
  reference: {
    max_images_per_reference: number
    attributes_max_fields: number
    attributes_max_depth: number
    attributes_max_value_length: number
    attributes_max_array_items: number
    attributes_max_json_bytes: number
    max_name_length: number
    max_description_length: number
    level_image_limits: { basic: number; advanced: number; cinematic: null }
  }
  visual_style: { max_description_length: number; max_prompt_fragment_length: number }
  upload: {
    image: { max_bytes: number; allowed_mime: string[] }
    music: { max_bytes: number; allowed_mime: string[] }
  }
  transfer: { max_archive_bytes: number; include_media_default: boolean }
  translation: { max_languages: number }
  media: { cache_max_age_seconds: number }
  assembly: { require_audio: boolean; music_default_volume: number; output_fps: number; aspects: string[]; hwaccel_enabled?: boolean }
  audio_qa: { enabled: boolean }
  providers: {
    video: string[]
    tts: string[]
    llm: string[]
    image: string[]
    audio_qa: string[]
    defaults: { default_video: string; default_tts: string; default_llm: string; default_image: string }
  }
}

export type HealthDeep = {
  status: string
  checks: Array<{ name: string; ok: boolean; detail?: string }>
}
