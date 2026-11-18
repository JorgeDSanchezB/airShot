'use client'

// AirShot — page.tsx (ruta única visible del sandbox): shell con vistas
// Proyectos / Workspace / Biblioteca / Estilos / Sistema. Footer sticky.
// TanStack Query (estado de servidor) + Zustand (navegación) + sonner (feedback).

import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, useTheme } from 'next-themes'
import { Camera, Library, Palette, Settings, Sun, Moon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { ProjectsView } from '@/components/airshot/organisms/ProjectsView'
import { WorkspaceView } from '@/components/airshot/organisms/WorkspaceView'
import { LibraryView } from '@/components/airshot/organisms/LibraryView'
import { StylesView } from '@/components/airshot/organisms/StylesView'
import { SettingsView } from '@/components/airshot/organisms/SettingsView'
import { useRuntimeConfig } from '@/hooks/airshot'
import { useWorkspace, type AppView } from '@/stores/workspace'

const NAV: Array<{ view: AppView; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { view: 'projects', label: 'Proyectos', icon: Camera },
  { view: 'library', label: 'Biblioteca', icon: Library },
  { view: 'styles', label: 'Estilos', icon: Palette },
  { view: 'settings', label: 'Sistema', icon: Settings },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  )
}

function AirShotShell() {
  const view = useWorkspace((s) => s.view)
  const setView = useWorkspace((s) => s.setView)
  const runtime = useRuntimeConfig()

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3">
          <button
            className="flex items-center gap-2 font-semibold"
            onClick={() => setView('projects')}
            aria-label="AirShot — inicio"
          >
            <Camera className="size-5" />
            <span className="text-sm tracking-tight">AirShot</span>
          </button>
          <nav className="ml-4 hidden items-center gap-1 sm:flex" aria-label="Navegación principal">
            {NAV.map((item) => (
              <Button
                key={item.view}
                size="sm"
                variant={view === item.view || (item.view === 'projects' && view === 'workspace') ? 'secondary' : 'ghost'}
                className="gap-1 text-xs"
                onClick={() => setView(item.view)}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </Button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {runtime.isError && <span className="text-[10px] text-destructive">config ✕</span>}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {view === 'projects' && <ProjectsView />}
        {view === 'workspace' && <WorkspaceView />}
        {view === 'library' && <LibraryView />}
        {view === 'styles' && <StylesView />}
        {view === 'settings' && <SettingsView />}
      </main>

      <footer className="mt-auto border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-[10px] text-muted-foreground">
          <span className="font-medium">AirShot</span>
          <span>historia → storyboard LLM → imagen/vídeo/narración IA → ensamblaje FFmpeg (local)</span>
          {runtime.data !== undefined && (
            <>
              <span className="font-mono">duraciones {runtime.data.scene.min_duration_seconds}–{runtime.data.scene.max_duration_seconds}s</span>
              <span className="font-mono">máx {runtime.data.scene.max_scenes_per_project} escenas</span>
              <span className="font-mono">máx {runtime.data.reference.max_images_per_reference} imágenes/referencia</span>
              <span className="font-mono">páginas ≤ {runtime.data.pagination.max_page_size}</span>
            </>
          )}
        </div>
      </footer>
    </div>
  )
}

export default function Home() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: (failureCount, error) => {
              // reintentos solo para errores marcados retryable (§3.1.1)
              const retryable = (error as { problem?: { retryable?: boolean } }).problem?.retryable === true
              return retryable && failureCount < 2
            },
          },
        },
      }),
  )

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <AirShotShell />
        <Toaster richColors closeButton position="bottom-right" />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
