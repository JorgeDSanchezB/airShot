// AirShot — hooks/airshot.ts (§5.2: claves canónicas + matriz de invalidación)
// Toda colección P se consume como useInfiniteQuery; sondeo con apagado automático.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiError } from '@/lib/airshot-client/client'
import type {
  AssemblyJobResponse,
  BatchStep,
  CursorPage,
  ProjectResponse,
  ProjectSummary,
  ReferenceResponse,
  SceneResponse,
} from '@/lib/airshot-client/types'

export const POLL_INTERVAL_MS = 2000

function toastProblem(prefix: string, err: unknown): void {
  if (err instanceof ApiError) {
    const hints = err.problem.hints ?? []
    toast.error(`${prefix}: ${err.problem.detail}`, {
      description: hints.length > 0 ? hints.join(' · ') : `${err.problem.code} (HTTP ${err.problem.status})${err.problem.retryable ? ' — reintentable' : ''}`,
    })
    return
  }
  toast.error(`${prefix}: ${err instanceof Error ? err.message : String(err)}`)
}

// ---------- queries (claves canónicas) ----------

export function useRuntimeConfig() {
  return useQuery({ queryKey: ['runtime-config'], queryFn: api.getRuntimeConfig, staleTime: 5 * 60 * 1000 })
}

export function useProjects(filters: { status?: string; q?: string } = {}) {
  return useInfiniteQuery({
    queryKey: ['projects', filters],
    queryFn: ({ pageParam }) => api.listProjects({ limit: 25, cursor: pageParam as string | null, ...filters }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

export function useProject(projectId: string | null) {
  return useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.getProject(projectId as string),
    enabled: projectId !== null,
  })
}

export function useScenes(projectId: string | null, status?: string) {
  return useInfiniteQuery({
    queryKey: ['scenes', projectId, { status }],
    queryFn: ({ pageParam }) =>
      api.listScenes(projectId as string, { limit: 25, cursor: pageParam as string | null, sortBy: 'order', order: 'asc', status }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: projectId !== null,
  })
}

export function useScene(sceneId: string | null) {
  return useQuery({
    queryKey: ['scene', sceneId],
    queryFn: () => api.getScene(sceneId as string),
    enabled: sceneId !== null,
    // sondeo con apagado automático: solo mientras hay operación pendiente
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status !== undefined && status.endsWith('_pending') ? POLL_INTERVAL_MS : false
    },
  })
}

export function useReferences(filters: { scope?: 'global' | 'project'; projectId?: string; type?: string; level?: string; q?: string } = {}) {
  return useInfiniteQuery({
    queryKey: ['references', { scope: filters.scope, projectId: filters.projectId, type: filters.type, level: filters.level, q: filters.q }],
    queryFn: ({ pageParam }) => api.listReferences({ limit: 25, cursor: pageParam as string | null, ...filters }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

export function usePublish(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { metadata?: boolean }) => api.publish(projectId, body),
    onSuccess: (result) => {
      toast.success(`Paquete listo (${(result.sizeBytes / 1024 / 1024).toFixed(1)} MB)`, {
        action: { label: 'Descargar', onClick: () => window.open(result.url, '_blank') },
      })
      void qc.invalidateQueries({ queryKey: ['ops-summary'] })
    },
    onError: (err) => toastProblem('Paquete de publicación', err),
  })
}

export function useLanguages(projectId: string) {
  return useQuery({
    queryKey: ['languages', projectId],
    queryFn: () => api.getLanguages(projectId),
  })
}

export function useTranslateProject(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { languages: string[]; voiceId?: string | null }) => api.translateProject(projectId, body),
    onSuccess: (result) => {
      toast.success(`Texto traducido: ${result.results.map((item) => `${item.language} (${item.scenes} escenas)`).join(' · ')}`, {
        description: 'Genera ahora las voces del idioma para poder doblar el ensamblaje.',
      })
      void qc.invalidateQueries({ queryKey: ['languages', projectId] })
    },
    onError: (err) => toastProblem('Traducir proyecto', err),
  })
}

export function useLanguageAudio(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ language, regenerate }: { language: string; regenerate?: boolean }) => api.generateLanguageAudio(projectId, language, { regenerate }),
    onSuccess: (result) => {
      if (result.failed > 0) {
        toast.warning(`Voces ${result.language}: ${result.generated} generadas, ${result.failed} fallidas`, {
          description: result.errors.slice(0, 2).map((error) => `${error.code}: ${error.detail}`).join(' · '),
        })
      } else {
        toast.success(`Voces ${result.language}: ${result.audioReady}/${result.totalScenes} escenas listas`)
      }
      void qc.invalidateQueries({ queryKey: ['languages', projectId] })
    },
    onError: (err) => toastProblem('Generar voces del idioma', err),
  })
}

export function useDeleteLanguage(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (language: string) => api.deleteLanguage(projectId, language),
    onSuccess: (result) => {
      toast.success(`Idioma «${result.language}» eliminado (${result.deleted} escenas)`)
      void qc.invalidateQueries({ queryKey: ['languages', projectId] })
    },
    onError: (err) => toastProblem('Eliminar idioma', err),
  })
}

export function useConsistency(projectId: string | null) {
  return useQuery({
    queryKey: ['consistency', projectId],
    queryFn: () => api.getConsistency(projectId as string),
    enabled: projectId !== null,
  })
}

export function useStyles(origin?: string) {
  return useInfiniteQuery({
    queryKey: ['visual-styles', { origin }],
    queryFn: ({ pageParam }) => api.listStyles({ limit: 25, cursor: pageParam as string | null, origin }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

export function useProviderConfigs(providerType?: string) {
  return useInfiniteQuery({
    queryKey: ['provider-configs', { providerType }],
    queryFn: ({ pageParam }) => api.listProviderConfigs({ limit: 25, cursor: pageParam as string | null, providerType }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

export function useVoices(provider?: string) {
  return useInfiniteQuery({
    queryKey: ['tts-voices', { provider }],
    queryFn: ({ pageParam }) => api.listVoices({ limit: 25, cursor: pageParam as string | null, provider }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })
}

export function useAssemblies(projectId: string | null) {
  return useInfiniteQuery({
    queryKey: ['assemblies', projectId],
    queryFn: ({ pageParam }) => api.listAssemblies(projectId as string, { limit: 25, cursor: pageParam as string | null }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: projectId !== null,
    refetchInterval: (query) => {
      const pages = query.state.data?.pages ?? []
      const active = pages.some((page) => page.items.some((job) => job.status === 'pending' || job.status === 'running'))
      return active ? POLL_INTERVAL_MS : false
    },
  })
}

export function useJob(jobId: string | null) {
  return useQuery({
    queryKey: ['assembly', jobId],
    queryFn: () => api.getAssemblyJob(jobId as string),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'pending' || status === 'running' ? POLL_INTERVAL_MS : false
    },
  })
}

export function useHealthDeep(enabled: boolean) {
  return useQuery({
    queryKey: ['health', 'deep'],
    queryFn: () => api.getHealth(true) as Promise<{ status: string; checks: Array<{ name: string; ok: boolean; detail?: string }> }>,
    enabled,
    refetchInterval: 30_000,
  })
}

// ---------- mutations (matriz de invalidación) ----------

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.createProject,
    onSuccess: () => {
      toast.success('Proyecto creado')
      void qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (err) => toastProblem('Crear proyecto', err),
  })
}

export function usePatchProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patchProject(id, body),
    onSuccess: (project: ProjectResponse) => {
      toast.success('Proyecto actualizado')
      void qc.invalidateQueries({ queryKey: ['project', project.id] })
      void qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (err) => toastProblem('Actualizar proyecto', err),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      toast.success('Proyecto borrado (assets incluidos)')
      void qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (err) => toastProblem('Borrar proyecto', err),
  })
}

export function useExportProject() {
  return useMutation({
    mutationFn: ({ id, includeMedia }: { id: string; includeMedia: boolean }) => api.exportProject(id, { includeMedia }),
    onSuccess: (result) => {
      toast.success(`Proyecto exportado (${(result.sizeBytes / 1024 / 1024).toFixed(1)} MB)`, {
        description: `${result.scenes} escenas · ${result.references} referencias · ${result.mediaFiles} archivos de media`,
        action: { label: 'Descargar', onClick: () => window.open(result.url, '_blank') },
      })
    },
    onError: (err) => toastProblem('Exportar proyecto', err),
  })
}

export function useImportProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => api.importProject(file),
    onSuccess: (result) => {
      toast.success(`Proyecto importado: «${result.title}»`, {
        description: result.warnings.length > 0 ? result.warnings.join(' · ') : `${result.scenes} escenas · ${result.mediaFiles} archivos de media`,
      })
      void qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (err) => toastProblem('Importar proyecto', err),
  })
}

export function useGenerateStoryboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, body }: { projectId: string; body: { regenerate?: boolean; targetDurationSeconds?: number } }) =>
      api.generateStoryboard(projectId, body),
    onSuccess: (result, vars) => {
      toast.success(`Storyboard listo: ${result.scenes.length} escenas`)
      // reemplaza escenas: refetch completo de detalle y lista
      void qc.invalidateQueries({ queryKey: ['project', vars.projectId] })
      void qc.invalidateQueries({ queryKey: ['scenes', vars.projectId] })
    },
    onError: (err) => toastProblem('Generar storyboard', err),
  })
}

export function usePatchScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patchScene(id, body),
    onSuccess: (scene: SceneResponse) => {
      toast.success('Escena actualizada')
      void qc.invalidateQueries({ queryKey: ['scene', scene.id] })
      void qc.invalidateQueries({ queryKey: ['scenes', scene.projectId] })
    },
    onError: (err) => toastProblem('Actualizar escena', err),
  })
}

export function useDeleteScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scene: SceneResponse) => api.deleteScene(scene.id),
    onSuccess: (_data, scene) => {
      toast.success(`Escena ${scene.orderIndex + 1} borrada`)
      void qc.removeQueries({ queryKey: ['scene', scene.id] })
      void qc.invalidateQueries({ queryKey: ['scenes', scene.projectId] })
      void qc.invalidateQueries({ queryKey: ['project', scene.projectId] })
    },
    onError: (err) => toastProblem('Borrar escena', err),
  })
}

export function useReorderScenes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, sceneIds }: { projectId: string; sceneIds: string[] }) => api.reorderScenes(projectId, sceneIds),
    onSuccess: (_data, vars) => {
      toast.success('Orden actualizado')
      void qc.invalidateQueries({ queryKey: ['scenes', vars.projectId] })
    },
    onError: (err) => toastProblem('Reordenar', err),
  })
}

export function usePutSceneReferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sceneId, items }: { sceneId: string; items: Array<{ referenceId: string; kind: 'subject' | 'environment' }> }) =>
      api.putSceneReferences(sceneId, items),
    onSuccess: (scene: SceneResponse) => {
      toast.success('Referencias asignadas')
      void qc.invalidateQueries({ queryKey: ['scene', scene.id] })
      void qc.invalidateQueries({ queryKey: ['scenes', scene.projectId] })
    },
    onError: (err) => toastProblem('Asignar referencias', err),
  })
}

function useSceneAssetMutation<T>(fn: (vars: T) => Promise<SceneResponse>, successLabel: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (scene: SceneResponse) => {
      toast.success(successLabel)
      // matriz §5.2 + render desde lista: se invalidan detalle, lista y proyecto
      // (el estado del proyecto avanza a in_production en el primer asset)
      void qc.invalidateQueries({ queryKey: ['scene', scene.id] })
      void qc.invalidateQueries({ queryKey: ['scenes', scene.projectId] })
      void qc.invalidateQueries({ queryKey: ['project', scene.projectId] })
    },
    onError: (err) => toastProblem(successLabel, err),
  })
}

export function useGenerateSceneImage() {
  return useSceneAssetMutation<string>((id) => api.generateSceneImage(id, {}), 'Imagen generada con IA')
}

export function useUploadSceneImage() {
  return useSceneAssetMutation<{ id: string; file: File }>(({ id, file }) => api.uploadSceneImage(id, file), 'Imagen subida')
}

export function useGenerateSceneAudio() {
  return useSceneAssetMutation<{ id: string; voiceId?: string | null }>(({ id, voiceId }) => api.generateSceneAudio(id, { voiceId }), 'Narración generada')
}

export function useGenerateSceneVideo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, providerOverride, durationSeconds }: { id: string; providerOverride?: string; durationSeconds?: number }) =>
      api.generateSceneVideo(id, { providerOverride, durationSeconds }),
    onSuccess: (scene: SceneResponse) => {
      toast.info('Generación de vídeo en curso (202) — sondeando la escena…')
      // el sondeo lo lleva useScene mientras status=video_pending
      void qc.invalidateQueries({ queryKey: ['scene', scene.id] })
      void qc.invalidateQueries({ queryKey: ['scenes', scene.projectId] })
    },
    onError: (err) => toastProblem('Generar vídeo', err),
  })
}

export function useSceneVersions(sceneId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['scene-versions', sceneId],
    queryFn: () => api.listSceneVersions(sceneId as string),
    enabled: enabled && sceneId !== null,
  })
}

export function useRestoreSceneVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sceneId, versionId }: { sceneId: string; versionId: string }) => api.restoreSceneVersion(sceneId, versionId),
    onSuccess: (scene: SceneResponse) => {
      toast.success('Versión restaurada')
      void qc.invalidateQueries({ queryKey: ['scene', scene.id] })
      void qc.invalidateQueries({ queryKey: ['scenes', scene.projectId] })
      void qc.invalidateQueries({ queryKey: ['scene-versions', scene.id] })
      void qc.invalidateQueries({ queryKey: ['project', scene.projectId] })
    },
    onError: (err) => toastProblem('Restaurar versión', err),
  })
}

export function useDeleteSceneAsset(kind: 'image' | 'video' | 'audio') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (scene: SceneResponse) => api.deleteSceneAsset(scene.id, kind),
    onSuccess: (_data, scene) => {
      toast.success('Asset descartado')
      void qc.invalidateQueries({ queryKey: ['scene', scene.id] })
      void qc.invalidateQueries({ queryKey: ['scenes', scene.projectId] })
    },
    onError: (err) => toastProblem('Descartar asset', err),
  })
}

export function useAssemble() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, body }: {
      projectId: string
      body: { includeAudio?: boolean; musicVolume?: number; aspect?: string; subtitles?: 'none' | 'srt' | 'burn'; duckMusic?: boolean; coverSceneId?: string | null; audioLanguage?: string | null; subtitleLanguages?: string[] }
    }) => api.assemble(projectId, body),
    onSuccess: (job: AssemblyJobResponse, vars) => {
      toast.info('Ensamblaje en curso (202) — sondea la lista de jobs')
      void qc.invalidateQueries({ queryKey: ['assemblies', vars.projectId] })
      void qc.invalidateQueries({ queryKey: ['project', vars.projectId] })
    },
    onError: (err) => toastProblem('Ensamblar', err),
  })
}

export function useRetryAssembly() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (job: { id: string; projectId: string }) => api.retryAssembly(job.id),
    onSuccess: (job: AssemblyJobResponse) => {
      toast.info(`Reintento lanzado (job ${job.id.slice(0, 8)}…)`)
      void qc.invalidateQueries({ queryKey: ['assemblies', job.projectId] })
      void qc.invalidateQueries({ queryKey: ['project', job.projectId] })
      void qc.invalidateQueries({ queryKey: ['ops-summary'] })
    },
    onError: (err) => toastProblem('Reintentar job', err),
  })
}

export function useOpsSummary(enabled: boolean) {
  return useQuery({
    queryKey: ['ops-summary'],
    queryFn: api.getOpsSummary,
    enabled,
    refetchInterval: 15_000,
  })
}

export function useBackupDatabase() {
  return useMutation({
    mutationFn: () => api.backupDatabase(),
    onSuccess: (result) => {
      toast.success(`Respaldo de BD listo (${(result.sizeBytes / 1024).toFixed(0)} KB)`, {
        action: { label: 'Descargar', onClick: () => window.open(result.url, '_blank') },
      })
    },
    onError: (err) => toastProblem('Respaldo de BD', err),
  })
}

export function useMediaReport(enabled: boolean) {
  return useQuery({
    queryKey: ['media-report'],
    queryFn: api.getMediaReport,
    enabled,
    staleTime: 30_000,
  })
}

export function useMediaGc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (apply: boolean) => api.gcMedia(apply),
    onSuccess: (result) => {
      if (result.applied) {
        toast.success(`Media huérfana borrada: ${result.deletedFiles} archivo(s), ${(result.freedBytes / 1024 / 1024).toFixed(1)} MB liberados`)
      } else {
        toast.info(`Simulación: ${result.orphanFiles} huérfanos (${(result.orphanBytes / 1024 / 1024).toFixed(1)} MB)`)
      }
      void qc.invalidateQueries({ queryKey: ['media-report'] })
      void qc.invalidateQueries({ queryKey: ['ops-summary'] })
    },
    onError: (err) => toastProblem('Limpiar media huérfana', err),
  })
}

export function useLatestBatch(projectId: string | null) {
  return useQuery({
    queryKey: ['batch', projectId],
    queryFn: () => api.getLatestBatch(projectId as string),
    enabled: projectId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.batch?.status
      return status === 'running' || status === 'paused' ? 2_000 : false
    },
  })
}

export function useStartBatch(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { steps?: BatchStep[]; regenerate?: boolean }) => api.startBatch(projectId, body),
    onSuccess: (run) => {
      toast.info(`Generación masiva en curso: ${run.total} escenas`)
      void qc.invalidateQueries({ queryKey: ['batch', projectId] })
    },
    onError: (err) => toastProblem('Generar todo', err),
  })
}

export function useBatchControl(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ batchId, action }: { batchId: string; action: 'pause' | 'resume' | 'cancel' }) =>
      api.controlBatch(batchId, action),
    onSuccess: (run) => {
      const label = run.status === 'paused' ? 'pausada' : run.status === 'cancelled' ? 'cancelada' : 'reanudada'
      toast.success(`Generación masiva ${label}`)
      void qc.invalidateQueries({ queryKey: ['batch', projectId] })
      if (run.status === 'cancelled' || run.status === 'completed') {
        void qc.invalidateQueries({ queryKey: ['scenes', projectId] })
        void qc.invalidateQueries({ queryKey: ['project', projectId] })
      }
    },
    onError: (err) => toastProblem('Controlar generación masiva', err),
  })
}

export function useAudioQA() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, features }: { projectId: string; features: string[] }) => api.runAudioQA(projectId, { features }),
    onSuccess: (job, vars) => {
      toast.info(`QA de audio en curso (job ${job.id.slice(0, 8)}…)`)
      void qc.invalidateQueries({ queryKey: ['assemblies', vars.projectId] })
    },
    onError: (err) => toastProblem('QA de audio', err),
  })
}

export function useMusicMutation(kind: 'upload' | 'delete') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ projectId, file }: { projectId: string; file?: File | null }): Promise<unknown> =>
      kind === 'upload' && file !== undefined && file !== null
        ? api.uploadMusic(projectId, file)
        : api.deleteMusic(projectId),
    onSuccess: (_data, vars) => {
      toast.success(kind === 'upload' ? 'Música subida' : 'Música eliminada')
      void qc.invalidateQueries({ queryKey: ['project', vars.projectId] })
    },
    onError: (err) => toastProblem(kind === 'upload' ? 'Subir música' : 'Quitar música', err),
  })
}

export function useReferenceCrud() {
  const qc = useQueryClient()
  const create = useMutation({
    mutationFn: api.createReference,
    onSuccess: () => {
      toast.success('Referencia creada')
      void qc.invalidateQueries({ queryKey: ['references'] })
    },
    onError: (err) => toastProblem('Crear referencia', err),
  })
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patchReference(id, body),
    onSuccess: (ref: ReferenceResponse) => {
      toast.success('Referencia actualizada')
      void qc.invalidateQueries({ queryKey: ['references'] })
      void qc.invalidateQueries({ queryKey: ['reference', ref.id] })
    },
    onError: (err) => toastProblem('Actualizar referencia', err),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteReference(id),
    onSuccess: () => {
      toast.success('Referencia borrada')
      void qc.invalidateQueries({ queryKey: ['references'] })
    },
    onError: (err) => toastProblem('Borrar referencia', err),
  })
  const uploadImage = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => api.uploadReferenceImage(id, file),
    onSuccess: (ref: ReferenceResponse) => {
      toast.success('Imagen subida')
      void qc.invalidateQueries({ queryKey: ['references'] })
      void qc.invalidateQueries({ queryKey: ['reference', ref.id] })
    },
    onError: (err) => toastProblem('Subir imagen', err),
  })
  const generateImage = useMutation({
    mutationFn: ({ id, styleId }: { id: string; styleId?: string }) => api.generateReferenceImage(id, styleId),
    onSuccess: (ref: ReferenceResponse) => {
      toast.success('Imagen generada con IA')
      void qc.invalidateQueries({ queryKey: ['references'] })
      void qc.invalidateQueries({ queryKey: ['reference', ref.id] })
    },
    onError: (err) => toastProblem('Generar imagen', err),
  })
  const deleteImage = useMutation({
    mutationFn: ({ id, imageId }: { id: string; imageId: string }) => api.deleteReferenceImage(id, imageId),
    onSuccess: (_data, vars) => {
      toast.success('Imagen eliminada')
      void qc.invalidateQueries({ queryKey: ['references'] })
      void qc.invalidateQueries({ queryKey: ['reference', vars.id] })
    },
    onError: (err) => toastProblem('Eliminar imagen', err),
  })
  const setPrimary = useMutation({
    mutationFn: ({ id, imageId }: { id: string; imageId: string }) => api.setPrimaryReferenceImage(id, imageId),
    onSuccess: (ref: ReferenceResponse) => {
      toast.success('Imagen primaria actualizada')
      void qc.invalidateQueries({ queryKey: ['references'] })
      void qc.invalidateQueries({ queryKey: ['reference', ref.id] })
    },
    onError: (err) => toastProblem('Marcar primaria', err),
  })
  return { create, patch, remove, uploadImage, generateImage, deleteImage, setPrimary }
}

export function useStyleCrud() {
  const qc = useQueryClient()
  const create = useMutation({
    mutationFn: api.createStyle,
    onSuccess: () => {
      toast.success('Estilo creado')
      void qc.invalidateQueries({ queryKey: ['visual-styles'] })
    },
    onError: (err) => toastProblem('Crear estilo', err),
  })
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patchStyle(id, body),
    onSuccess: () => {
      toast.success('Estilo actualizado')
      void qc.invalidateQueries({ queryKey: ['visual-styles'] })
    },
    onError: (err) => toastProblem('Actualizar estilo', err),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteStyle(id),
    onSuccess: () => {
      toast.success('Estilo borrado')
      void qc.invalidateQueries({ queryKey: ['visual-styles'] })
    },
    onError: (err) => toastProblem('Borrar estilo', err),
  })
  return { create, patch, remove }
}

export function useProviderConfigCrud() {
  const qc = useQueryClient()
  const upsert = useMutation({
    mutationFn: api.upsertProviderConfig,
    onSuccess: (row, vars) => {
      toast.success(vars.providerName !== undefined ? `Config guardada (${vars.providerName})` : 'Config guardada')
      void qc.invalidateQueries({ queryKey: ['provider-configs'] })
    },
    onError: (err) => toastProblem('Guardar config', err),
  })
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patchProviderConfig(id, body),
    onSuccess: () => {
      toast.success('Config actualizada')
      void qc.invalidateQueries({ queryKey: ['provider-configs'] })
    },
    onError: (err) => toastProblem('Actualizar config', err),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteProviderConfig(id),
    onSuccess: () => {
      toast.success('Config borrada')
      void qc.invalidateQueries({ queryKey: ['provider-configs'] })
    },
    onError: (err) => toastProblem('Borrar config', err),
  })
  const test = useMutation({
    mutationFn: (id: string) => api.testProviderConfig(id),
    onSuccess: (result) => {
      if (result.ok) {
        toast.success(`Prueba OK (${result.latencyMs} ms)`)
      } else {
        toast.error(`Prueba fallida: ${result.error?.detail ?? 'sin detalle'} (${result.error?.code ?? '?'})`)
      }
      void qc.invalidateQueries({ queryKey: ['provider-configs'] })
    },
    onError: (err) => toastProblem('Probar config', err),
  })
  return { upsert, patch, remove, test }
}

export function usePatchProjectBatch() {
  // helper de confort para settings del proyecto en el workspace
  return usePatchProject()
}

export type ProjectSummaryPage = CursorPage<ProjectSummary>
