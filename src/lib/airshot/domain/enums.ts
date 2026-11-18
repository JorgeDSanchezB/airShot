// AirShot — domain/enums.ts
// Enums del dominio (§2.3). SQLite vía Prisma no soporta enums nativos:
// se validan aquí (capa de aplicación) y se persisten como TEXT.

export const PROJECT_STATUSES = ['draft', 'storyboard_ready', 'in_production', 'assembling', 'assembled', 'failed'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const SCENE_STATUSES = ['draft', 'image_pending', 'image_ready', 'video_pending', 'video_ready', 'audio_pending', 'audio_ready', 'failed'] as const
export type SceneStatus = (typeof SCENE_STATUSES)[number]

export const REFERENCE_TYPES = ['character', 'location'] as const
export type ReferenceType = (typeof REFERENCE_TYPES)[number]

export const LIBRARY_SCOPES = ['global', 'project'] as const
export type LibraryScope = (typeof LIBRARY_SCOPES)[number]

export const REFERENCE_LEVELS = ['basic', 'advanced', 'cinematic'] as const
export type ReferenceLevel = (typeof REFERENCE_LEVELS)[number]

export const NARRATION_SOURCES = ['improved', 'original', 'custom'] as const
export type NarrationSource = (typeof NARRATION_SOURCES)[number]

export const OUTPUT_FORMATS = ['mp4'] as const
export type OutputFormat = (typeof OUTPUT_FORMATS)[number]

export const OUTPUT_RESOLUTIONS = ['720p', '1080p'] as const
export type OutputResolution = (typeof OUTPUT_RESOLUTIONS)[number]

export const JOB_TYPES = ['assembly', 'audio_qa'] as const
export type JobType = (typeof JOB_TYPES)[number]

export const JOB_STATUSES = ['pending', 'running', 'completed', 'failed'] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export const SCENE_REFERENCE_KINDS = ['subject', 'environment'] as const
export type SceneReferenceKind = (typeof SCENE_REFERENCE_KINDS)[number]
