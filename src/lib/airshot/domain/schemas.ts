// AirShot — domain/schemas.ts
// Contratos de request (C-01: zod estricto — clave desconocida ⇒ 422 UNEXPECTED_FIELD).
// Límites leídos SIEMPRE de config (cero hardcoding). Nulidad por campo según §2.3
// (null ≠ ausente: z.nullish()/z.nullable() solo donde el contrato lo declara).

import { z } from 'zod'
import { airshotConfig, airshotRegistry } from '@/lib/airshot/config/loader'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const uuidField = z.string().regex(UUID_RE, 'UUID malformado')

const registeredVideo = z.string().refine(
  (v) => Object.prototype.hasOwnProperty.call(airshotRegistry.video, v),
  { message: 'proveedor de vídeo no registrado en providers.yaml' },
)
const registeredTts = z.string().refine(
  (v) => Object.prototype.hasOwnProperty.call(airshotRegistry.tts, v),
  { message: 'proveedor TTS no registrado en providers.yaml' },
)

const title = z.string().min(1).max(airshotConfig.story.max_title_length)
const originalStory = z.string().min(1).max(airshotConfig.story.max_original_story_length)
const resolution = z.enum(['720p', '1080p'])

// ---------- Projects ----------

export const CreateProjectRequest = z.strictObject({
  title,
  originalStory,
  settings: z
    .strictObject({
      videoProvider: registeredVideo.nullish(),
      ttsProvider: registeredTts.nullish(),
      visualStyleId: uuidField.nullish(),
      outputResolution: resolution.nullish(),
      voiceId: z.string().max(200).nullish(),
      visualSeed: z.number().int().min(0).max(2 ** 31 - 1).nullish(),
    })
    .nullish(),
})

export const PatchProjectRequest = z.strictObject({
  title: title.optional(),
  originalStory: originalStory.optional(),
  improvedStory: z.string().max(airshotConfig.story.max_original_story_length).nullable().optional(),
  visualStyleId: uuidField.nullable().optional(),
  videoProvider: registeredVideo.nullable().optional(),
  ttsProvider: registeredTts.nullable().optional(),
  outputResolution: resolution.optional(),
  voiceId: z.string().max(200).nullable().optional(),
  musicVolume: z.number().positive().max(1).optional(),
  visualSeed: z.number().int().min(0).max(2 ** 31 - 1).nullable().optional(),
})

export const StoryboardRequest = z.strictObject({
  regenerate: z.boolean().optional(),
  targetDurationSeconds: z
    .number()
    .int()
    .gte(airshotConfig.scene.min_duration_seconds)
    .lte(airshotConfig.scene.max_duration_seconds)
    .optional(),
})

// las proporciones válidas salen de config (cero hardcoding)
const aspectKey = z.enum(Object.keys(airshotConfig.assembly.aspect_ratios) as [string, ...string[]])

export const languageField = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'idioma ISO 639-1 (p. ej. en, en-US)')

export const AssembleRequest = z.strictObject({
  includeAudio: z.boolean().optional(),
  musicVolume: z.number().positive().max(1).optional(),
  aspect: aspectKey.optional(),
  subtitles: z.enum(['none', 'srt', 'burn']).optional(),
  duckMusic: z.boolean().optional(),
  coverSceneId: uuidField.nullable().optional(),
  audioLanguage: languageField.nullable().optional(),
  subtitleLanguages: z.array(languageField).max(airshotConfig.translation.max_languages).optional(),
})

export const TranslateProjectRequest = z.strictObject({
  languages: z.array(languageField).min(1).max(airshotConfig.translation.max_languages),
  voiceId: z.string().max(200).nullable().optional(),
})

export const GenerateLanguageAudioRequest = z.strictObject({
  regenerate: z.boolean().optional(),
  voiceId: z.string().max(200).nullable().optional(),
})

export const AudioQARequest = z.strictObject({
  features: z.array(z.enum(['naturalness', 'sync', 'loudness', 'artifacts'])).min(1),
  generateSfx: z.boolean().optional(),
})

// ---------- Scenes ----------

export const PatchSceneRequest = z.strictObject({
  durationSeconds: z
    .number()
    .int()
    .gte(airshotConfig.scene.min_duration_seconds)
    .lte(airshotConfig.scene.max_duration_seconds)
    .optional(),
  // INV-13: promptEn en ASCII imprimible (validado en capa API, §2.4)
  promptEn: z
    .string()
    .min(1)
    .max(airshotConfig.scene.prompt_max_length)
    .regex(/^[\x20-\x7E\r\n\t]*$/, 'promptEn debe ser ASCII imprimible (INV-13)')
    .nullable()
    .optional(),
  improvedText: z.string().max(airshotConfig.story.max_original_story_length).nullable().optional(),
  narrationSource: z.enum(['improved', 'original', 'custom']).optional(),
  narrationText: z.string().max(airshotConfig.scene.prompt_max_length).nullable().optional(),
  voiceId: z.string().max(200).nullable().optional(),
  seed: z.number().int().min(0).max(2 ** 31 - 1).nullable().optional(),
  trimStartSeconds: z.number().min(0).max(airshotConfig.scene.max_duration_seconds).nullable().optional(),
  trimEndSeconds: z.number().min(0).max(airshotConfig.scene.max_duration_seconds).nullable().optional(),
})

export const GenerateSceneImageRequest = z.strictObject({
  providerOverride: z.string().max(100).optional(),
  styleId: uuidField.optional(),
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
})

export const GenerateSceneVideoRequest = z.strictObject({
  providerOverride: registeredVideo.optional(),
  seed: z.number().int().min(0).max(2 ** 31 - 1).optional(),
  durationSeconds: z
    .number()
    .int()
    .gte(airshotConfig.scene.min_duration_seconds)
    .lte(airshotConfig.scene.max_duration_seconds)
    .optional(),
})

export const GenerateSceneAudioRequest = z.strictObject({
  providerOverride: registeredTts.optional(),
  voiceId: z.string().max(200).nullable().optional(),
})

export const ReorderScenesRequest = z.strictObject({
  sceneIds: z.array(uuidField).min(1),
})

export const BatchGenerateRequest = z.strictObject({
  steps: z.array(z.enum(['image', 'audio', 'video'])).min(1).max(3).optional(),
  regenerate: z.boolean().optional(),
})

export const BatchControlRequest = z.strictObject({
  action: z.enum(['pause', 'resume', 'cancel']),
})

export const PublishRequest = z.strictObject({
  metadata: z.boolean().optional(),
})

export const ExportProjectRequest = z.strictObject({
  includeMedia: z.boolean().optional(),
})

export const MediaGcRequest = z.strictObject({
  apply: z.boolean(),
})

export const SceneReferencesPutRequest = z.strictObject({
  items: z
    .array(
      z.strictObject({
        referenceId: uuidField,
        kind: z.enum(['subject', 'environment']),
      }),
    )
    .max(
      airshotConfig.scene_reference.max_subjects_per_scene
      + airshotConfig.scene_reference.max_environments_per_scene,
    ),
})

// ---------- References ----------

export const CreateReferenceRequest = z.strictObject({
  type: z.enum(['character', 'location']),
  name: z.string().min(1).max(airshotConfig.reference.max_name_length),
  description: z.string().max(airshotConfig.reference.max_description_length).nullish(),
  libraryScope: z.enum(['global', 'project']),
  projectId: uuidField.nullish(),
  level: z.enum(['basic', 'advanced', 'cinematic']).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
})

export const PatchReferenceRequest = z.strictObject({
  type: z.enum(['character', 'location']).optional(),
  name: z.string().min(1).max(airshotConfig.reference.max_name_length).optional(),
  description: z.string().max(airshotConfig.reference.max_description_length).nullable().optional(),
  level: z.enum(['basic', 'advanced', 'cinematic']).optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
})

export const GenerateReferenceImageRequest = z.strictObject({
  styleId: uuidField.optional(),
})

export const ReferenceImagePrimaryRequest = z.strictObject({
  isPrimary: z.literal(true, { message: 'se exige exactly-one: isPrimary debe ser true' }),
})

// ---------- Visual styles ----------

export const CreateVisualStyleRequest = z.strictObject({
  name: z.string().min(1).max(200),
  description: z.string().max(airshotConfig.visual_style.max_description_length).nullish(),
  promptFragmentEn: z.string().min(1).max(airshotConfig.visual_style.max_prompt_fragment_length),
})

export const PatchVisualStyleRequest = z.strictObject({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(airshotConfig.visual_style.max_description_length).nullable().optional(),
  promptFragmentEn: z.string().min(1).max(airshotConfig.visual_style.max_prompt_fragment_length).optional(),
})

// ---------- Provider configs ----------

const providerTypeSchema = z.enum(['video', 'tts', 'llm', 'image', 'audio_qa'])
const providerNameSchema = z.string().min(1).max(100).refine(
  (v) => /^[a-z][a-z0-9-]{0,49}$/.test(v),
  { message: 'nombre de proveedor inválido (^[a-z][a-z0-9-]{0,49}$)' },
)

export const UpsertProviderConfigRequest = z.strictObject({
  providerType: providerTypeSchema,
  providerName: providerNameSchema,
  apiKey: z.string().min(1).max(2000).nullish(),
  baseUrl: z.string().url().max(500).nullish(),
  defaultParams: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
})

export const PatchProviderConfigRequest = z.strictObject({
  apiKey: z.string().min(1).max(2000).nullable().optional(),
  baseUrl: z.string().url().max(500).nullable().optional(),
  defaultParams: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
})
