// AirShot — client/client.ts
// fetch wrapper: cursor en query, problem+json → ApiError (con hints accionables),
// endpoints del catálogo §3.2. Rutas relativas (sandbox gateway).

import type {
  AppProblem,
  AssemblyJobResponse,
  CursorPage,
  HealthDeep,
  OpsSummary,
  ProjectResponse,
  ProjectSummary,
  ProviderConfigResponse,
  ReferenceResponse,
  RuntimeConfig,
  SceneResponse,
  VisualStyleResponse,
  VoiceInfo,
} from '@/lib/airshot-client/types'

export class ApiError extends Error {
  constructor(readonly problem: AppProblem) {
    super(problem.detail)
    this.name = 'ApiError'
  }
}

const BASE = '/api/v1'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 204) {
    return undefined as T
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/problem+json')) {
    const problem = (await res.json()) as AppProblem
    throw new ApiError(problem)
  }
  if (!res.ok) {
    // error sin RFC 7807 (no debería ocurrir): se sintetiza sin ocultar el estado
    const text = await res.text()
    throw new ApiError({
      type: 'about:blank',
      title: 'HTTP error',
      status: res.status,
      detail: text.slice(0, 300) || `HTTP ${res.status}`,
      code: 'INTERNAL_ERROR',
      retryable: false,
    })
  }
  return (await res.json()) as T
}

function withQuery(path: string, params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const qs = search.toString()
  return qs.length > 0 ? `${path}?${qs}` : path
}

// ---------- projects ----------

export const api = {
  listProjects: (params: { limit?: number; cursor?: string | null; status?: string; q?: string; order?: string }) =>
    apiFetch<CursorPage<ProjectSummary>>(withQuery('/projects', params)),

  createProject: (body: {
    title: string
    originalStory: string
    settings?: { videoProvider?: string; ttsProvider?: string; visualStyleId?: string; outputResolution?: string; voiceId?: string }
  }) => apiFetch<ProjectResponse>('/projects', { method: 'POST', body: JSON.stringify(body) }),

  getProject: (id: string) => apiFetch<ProjectResponse>(`/projects/${id}`),

  patchProject: (id: string, body: Record<string, unknown>) =>
    apiFetch<ProjectResponse>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteProject: (id: string) => apiFetch<void>(`/projects/${id}`, { method: 'DELETE' }),

  generateStoryboard: (id: string, body: { regenerate?: boolean; targetDurationSeconds?: number }) =>
    apiFetch<{ improvedStory: string; scenes: SceneResponse[] }>(`/projects/${id}/storyboard`, { method: 'POST', body: JSON.stringify(body) }),

  uploadMusic: (id: string, file: File) => {
    const form = new FormData()
    form.set('file', file)
    return apiFetch<{ musicAssetKey: string; durationSeconds: number | null }>(`/projects/${id}/music`, {
      method: 'POST',
      body: form,
      headers: { 'x-file-name': encodeURIComponent(file.name) },
    })
  },

  deleteMusic: (id: string) => apiFetch<void>(`/projects/${id}/music`, { method: 'DELETE' }),

  assemble: (id: string, body: { includeAudio?: boolean; musicVolume?: number; aspect?: string; subtitles?: 'none' | 'srt' | 'burn'; duckMusic?: boolean; coverSceneId?: string | null }) =>
    apiFetch<AssemblyJobResponse>(`/projects/${id}/assemble`, { method: 'POST', body: JSON.stringify(body) }),

  retryAssembly: (jobId: string) =>
    apiFetch<AssemblyJobResponse>(`/assemblies/${jobId}/retry`, { method: 'POST', body: JSON.stringify({}) }),

  getOpsSummary: () => apiFetch<OpsSummary>('/ops/summary'),

  runAudioQA: (id: string, body: { features: string[]; generateSfx?: boolean }) =>
    apiFetch<AssemblyJobResponse>(`/projects/${id}/audio-qa`, { method: 'POST', body: JSON.stringify(body) }),

  listAssemblies: (id: string, params: { limit?: number; cursor?: string | null; jobType?: string }) =>
    apiFetch<CursorPage<AssemblyJobResponse>>(withQuery(`/projects/${id}/assemblies`, params)),

  getAssemblyJob: (jobId: string) => apiFetch<AssemblyJobResponse>(`/assemblies/${jobId}`),

  // ---------- scenes ----------

  listScenes: (projectId: string, params: { limit?: number; cursor?: string | null; status?: string; sortBy?: string; order?: string }) =>
    apiFetch<CursorPage<SceneResponse>>(withQuery(`/projects/${projectId}/scenes`, params)),

  getScene: (id: string) => apiFetch<SceneResponse>(`/scenes/${id}`),

  patchScene: (id: string, body: Record<string, unknown>) =>
    apiFetch<SceneResponse>(`/scenes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteScene: (id: string) => apiFetch<void>(`/scenes/${id}`, { method: 'DELETE' }),

  reorderScenes: (projectId: string, sceneIds: string[]) =>
    apiFetch<{ scenes: SceneResponse[] }>(`/projects/${projectId}/scenes/order`, { method: 'PUT', body: JSON.stringify({ sceneIds }) }),

  putSceneReferences: (id: string, items: Array<{ referenceId: string; kind: 'subject' | 'environment' }>) =>
    apiFetch<SceneResponse>(`/scenes/${id}/references`, { method: 'PUT', body: JSON.stringify({ items }) }),

  generateSceneImage: (id: string, body: { providerOverride?: string; styleId?: string }) =>
    apiFetch<SceneResponse>(`/scenes/${id}/generate-image`, { method: 'POST', body: JSON.stringify(body) }),

  uploadSceneImage: (id: string, file: File) => {
    const form = new FormData()
    form.set('file', file)
    return apiFetch<SceneResponse>(`/scenes/${id}/image`, { method: 'POST', body: form })
  },

  deleteSceneAsset: (id: string, kind: 'image' | 'video' | 'audio') =>
    apiFetch<void>(`/scenes/${id}/${kind}`, { method: 'DELETE' }),

  generateSceneVideo: (id: string, body: { providerOverride?: string; durationSeconds?: number }) =>
    apiFetch<SceneResponse>(`/scenes/${id}/generate-video`, { method: 'POST', body: JSON.stringify(body) }),

  generateSceneAudio: (id: string, body: { providerOverride?: string; voiceId?: string | null }) =>
    apiFetch<SceneResponse>(`/scenes/${id}/generate-audio`, { method: 'POST', body: JSON.stringify(body) }),

  // ---------- references ----------

  listReferences: (params: { scope?: string; projectId?: string; type?: string; level?: string; q?: string; limit?: number; cursor?: string | null; order?: string }) =>
    apiFetch<CursorPage<ReferenceResponse>>(withQuery('/references', params)),

  createReference: (body: {
    type: 'character' | 'location'
    name: string
    description?: string | null
    libraryScope: 'global' | 'project'
    projectId?: string | null
    level?: 'basic' | 'advanced' | 'cinematic'
    attributes?: Record<string, unknown>
  }) => apiFetch<ReferenceResponse>('/references', { method: 'POST', body: JSON.stringify(body) }),

  getReference: (id: string) => apiFetch<ReferenceResponse>(`/references/${id}`),

  patchReference: (id: string, body: Record<string, unknown>) =>
    apiFetch<ReferenceResponse>(`/references/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteReference: (id: string) => apiFetch<void>(`/references/${id}`, { method: 'DELETE' }),

  uploadReferenceImage: (id: string, file: File) => {
    const form = new FormData()
    form.set('file', file)
    return apiFetch<ReferenceResponse>(`/references/${id}/images`, { method: 'POST', body: form })
  },

  generateReferenceImage: (id: string, styleId?: string) =>
    apiFetch<ReferenceResponse>(`/references/${id}/generate-image`, { method: 'POST', body: JSON.stringify({ styleId }) }),

  deleteReferenceImage: (id: string, imageId: string) =>
    apiFetch<void>(`/references/${id}/images/${imageId}`, { method: 'DELETE' }),

  setPrimaryReferenceImage: (id: string, imageId: string) =>
    apiFetch<ReferenceResponse>(`/references/${id}/images/${imageId}`, { method: 'PATCH', body: JSON.stringify({ isPrimary: true }) }),

  // ---------- visual styles ----------

  listStyles: (params: { origin?: string; limit?: number; cursor?: string | null; order?: string }) =>
    apiFetch<CursorPage<VisualStyleResponse>>(withQuery('/visual-styles', params)),

  createStyle: (body: { name: string; description?: string | null; promptFragmentEn: string }) =>
    apiFetch<VisualStyleResponse>('/visual-styles', { method: 'POST', body: JSON.stringify(body) }),

  patchStyle: (id: string, body: Record<string, unknown>) =>
    apiFetch<VisualStyleResponse>(`/visual-styles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteStyle: (id: string) => apiFetch<void>(`/visual-styles/${id}`, { method: 'DELETE' }),

  // ---------- provider configs ----------

  listProviderConfigs: (params: { providerType?: string; limit?: number; cursor?: string | null; order?: string }) =>
    apiFetch<CursorPage<ProviderConfigResponse>>(withQuery('/provider-configs', params)),

  upsertProviderConfig: (body: {
    providerType: string
    providerName: string
    apiKey?: string | null
    baseUrl?: string | null
    defaultParams?: Record<string, unknown>
    isActive?: boolean
  }) => apiFetch<ProviderConfigResponse>('/provider-configs', { method: 'POST', body: JSON.stringify(body) }),

  patchProviderConfig: (id: string, body: Record<string, unknown>) =>
    apiFetch<ProviderConfigResponse>(`/provider-configs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteProviderConfig: (id: string) => apiFetch<void>(`/provider-configs/${id}`, { method: 'DELETE' }),

  testProviderConfig: (id: string) =>
    apiFetch<{ ok: boolean; latencyMs: number; error?: { code: string; detail: string } }>(`/provider-configs/${id}/test`, { method: 'POST' }),

  // ---------- misc ----------

  listVoices: (params: { provider?: string; limit?: number; cursor?: string | null }) =>
    apiFetch<CursorPage<VoiceInfo>>(withQuery('/tts/voices', params)),

  getRuntimeConfig: () => apiFetch<RuntimeConfig>('/config'),

  getHealth: (deep: boolean) => apiFetch<HealthDeep | { status: string }>(deep ? '/health?deep=true' : '/health'),
}
