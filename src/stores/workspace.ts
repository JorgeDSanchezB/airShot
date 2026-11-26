// AirShot — stores/workspace.ts (Zustand: estado de UI — selección, pestaña)
// El estado de servidor vive en TanStack Query; aquí solo navegación local.

import { create } from 'zustand'

export type AppView = 'projects' | 'workspace' | 'library' | 'styles' | 'settings'
export type WorkspaceTab = 'storyboard' | 'timeline' | 'references' | 'audio' | 'assembly'

interface WorkspaceState {
  view: AppView
  projectId: string | null
  tab: WorkspaceTab
  openProject: (projectId: string) => void
  setView: (view: AppView) => void
  setTab: (tab: WorkspaceTab) => void
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  view: 'projects',
  projectId: null,
  tab: 'storyboard',
  openProject: (projectId) => set({ view: 'workspace', projectId, tab: 'storyboard' }),
  setView: (view) => set({ view }),
  setTab: (tab) => set({ tab }),
}))
