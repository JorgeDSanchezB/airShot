// AirShot — config/loader.ts
// Fuente única de límites de negocio (Anexo A): config/config.yaml,
// config/providers.yaml (Anexo B) y config/styles.yaml (Anexo D), parseados con
// `yaml` y validados con zod (equivalente de Pydantic Settings en este runtime).
// Cero hardcoding: todo consumidor importa `airshotConfig` desde aquí.
// Reglas de coherencia validadas en arranque (nota del Anexo A).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import { z } from 'zod'

const CONFIG_DIR = resolve(process.cwd(), 'config')

// ---------- config.yaml (Anexo A) ----------

export const AppConfigSchema = z.object({
  app: z.object({
    name: z.string().min(1),
    local_user_id: z.string().min(1),
    max_body_bytes: z.number().int().positive(),
    request_timeout_seconds: z.number().int().positive(),
    batch_max_operations: z.number().int().positive(),
    pending_stale_ms: z.number().int().positive(),
    log_level: z.string(),
  }),
  pagination: z.object({
    default_page_size: z.number().int().min(1),
    max_page_size: z.number().int().min(1),
  }),
  story: z.object({
    max_title_length: z.number().int().min(1),
    max_original_story_length: z.number().int().min(1),
  }),
  scene: z.object({
    min_duration_seconds: z.number().int().min(1),
    default_duration_seconds: z.number().int().min(1),
    max_duration_seconds: z.number().int().min(1),
    max_scenes_per_project: z.number().int().min(1),
    prompt_max_length: z.number().int().min(1),
    composed_prompt_max_chars: z.number().int().min(1),
  }),
  reference: z.object({
    max_images_per_reference: z.number().int().min(1),
    attributes_max_fields: z.number().int().min(1),
    attributes_max_depth: z.number().int().min(1),
    attributes_max_value_length: z.number().int().min(1),
    attributes_max_array_items: z.number().int().min(1),
    attributes_max_json_bytes: z.number().int().min(1),
    sensitive_key_denied: z.array(z.string()),
    max_name_length: z.number().int().min(1),
    max_description_length: z.number().int().min(1),
    attributes_max_nested_fields: z.number().int().min(1),
    dangerous_key_denied: z.array(z.string()),
    level_image_limits: z.object({
      basic: z.number().int().min(1),
      advanced: z.number().int().min(1),
      cinematic: z.null(),
    }),
  }),
  scene_reference: z.object({
    max_subjects_per_scene: z.number().int().min(0),
    max_environments_per_scene: z.number().int().min(0),
  }),
  visual_style: z.object({
    max_description_length: z.number().int().min(1),
    max_prompt_fragment_length: z.number().int().min(1),
  }),
  upload: z.object({
    image: z.object({
      max_bytes: z.number().int().positive(),
      allowed_mime: z.array(z.string()),
    }),
    music: z.object({
      max_bytes: z.number().int().positive(),
      allowed_mime: z.array(z.string()),
    }),
  }),
  assembly: z.object({
    ffmpeg_path: z.string(),
    ffprobe_path: z.string(),
    job_timeout_seconds: z.number().int().positive(),
    require_audio: z.boolean(),
    video_codec: z.string(),
    video_crf: z.number().int().min(0).max(51),
    video_preset: z.string(),
    output_fps: z.number().int().positive(),
    audio_sample_rate: z.number().int().positive(),
    audio_channels: z.number().int().min(1).max(2),
    audio_bitrate_kbps: z.number().int().positive(),
    music_default_volume: z.number(),
    music_fade_out_seconds: z.number(),
  }),
  storage: z.object({
    root: z.string(),
  }),
  media: z.object({
    cache_max_age_seconds: z.number().int().min(0),
  }),
  security: z.object({
    api_key_mask_visible_chars: z.number().int().min(0),
    rate_limit: z.object({
      enabled: z.boolean(),
      window_seconds: z.number().int().positive(),
      max_requests: z.number().int().positive(),
      max_sensitive_requests: z.number().int().positive(),
    }),
  }),
  audio_qa: z.object({
    earshot: z.object({
      enabled: z.boolean(),
      report_dir: z.string(),
      lufs_target_min: z.number(),
      lufs_target_max: z.number(),
      sync_tolerance_seconds: z.number(),
    }),
  }),
  providers: z.object({
    default_tts: z.string(),
    default_llm: z.string(),
    default_image: z.string(),
    default_video: z.string(),
  }),
})

export type AppConfig = z.infer<typeof AppConfigSchema>

// ---------- providers.yaml (Anexo B) ----------

export const ProviderEntrySchema = z.object({
  adapter: z.string(),
  auth: z.enum(['env', 'none', 'api_key']),
  base_url: z.string().nullable(),
  timeout_seconds: z.number().int().positive(),
  max_retries: z.number().int().min(0),
  backoff_base_seconds: z.number().positive(),
  max_concurrent: z.number().int().min(1),
  supported_durations: z.array(z.number().int().min(1)).optional(),
  reference_image_limit: z.number().int().min(0).optional(),
  max_text_chars: z.number().int().min(1).optional(),
  default_voice: z.string().nullable().optional(),
  default_temperature: z.number().optional(),
  landscape_size: z.string().optional(),
})

export type ProviderEntry = z.infer<typeof ProviderEntrySchema>

export type ProviderType = 'video' | 'tts' | 'llm' | 'image' | 'audio_qa'

const RegistrySchema = z.object({
  video: z.record(z.string(), ProviderEntrySchema),
  tts: z.record(z.string(), ProviderEntrySchema),
  llm: z.record(z.string(), ProviderEntrySchema),
  image: z.record(z.string(), ProviderEntrySchema),
  audio_qa: z.record(z.string(), ProviderEntrySchema),
})

export type ProvidersRegistry = z.infer<typeof RegistrySchema>

// ---------- styles.yaml (Anexo D) ----------

const StylesSeedSchema = z.array(
  z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    promptFragmentEn: z.string().min(1),
  }),
)

export type StyleSeed = z.infer<typeof StylesSeedSchema>

// ---------- carga + reglas de coherencia ----------

function parseYamlFile(file: string): unknown {
  const raw = readFileSync(resolve(CONFIG_DIR, file), 'utf8')
  return YAML.parse(raw)
}

function loadConfig(): AppConfig {
  const parsed = AppConfigSchema.parse(parseYamlFile('config.yaml'))
  // Reglas de coherencia del Anexo A (fail-fast en arranque):
  const maxUpload = Math.max(parsed.upload.image.max_bytes, parsed.upload.music.max_bytes)
  if (parsed.app.max_body_bytes < maxUpload) {
    throw new Error(`config: app.max_body_bytes (${parsed.app.max_body_bytes}) < max(upload.*) (${maxUpload})`)
  }
  if (parsed.scene.min_duration_seconds > parsed.scene.default_duration_seconds
    || parsed.scene.default_duration_seconds > parsed.scene.max_duration_seconds) {
    throw new Error('config: scene.default_duration_seconds fuera de [min,max]')
  }
  return parsed
}

function loadRegistry(config: AppConfig): ProvidersRegistry {
  const registry = RegistrySchema.parse(parseYamlFile('providers.yaml'))
  // Coherencia de defaults: cada default debe estar registrado en su tipo
  const checks: Array<[ProviderType, string]> = [
    ['video', config.providers.default_video],
    ['tts', config.providers.default_tts],
    ['llm', config.providers.default_llm],
    ['image', config.providers.default_image],
  ]
  for (const [type, name] of checks) {
    if (registry[type]?.[name] === undefined) {
      throw new Error(`config: providers.default_* "${name}" no está registrado en providers.yaml [${type}]`)
    }
  }
  return registry
}

declare global {
  var __airshotConfigCache: {
    config: AppConfig
    registry: ProvidersRegistry
    styles: StyleSeed
  } | undefined
}

function loadAll() {
  let cache = globalThis.__airshotConfigCache
  if (cache === undefined) {
    const config = loadConfig()
    const registry = loadRegistry(config)
    const styles = StylesSeedSchema.parse(parseYamlFile('styles.yaml'))
    cache = { config, registry, styles }
    globalThis.__airshotConfigCache = cache
  }
  return cache
}

export const airshotConfig: AppConfig = loadAll().config
export const airshotRegistry: ProvidersRegistry = loadAll().registry
export const airshotStylesSeed: StyleSeed = loadAll().styles

export function listProviderNames(type: ProviderType): string[] {
  return Object.keys(airshotRegistry[type]).sort()
}

export function getRegistryEntry(type: ProviderType, name: string): ProviderEntry | undefined {
  return airshotRegistry[type][name]
}
