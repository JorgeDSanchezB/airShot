'use client'

// AirShot — page.tsx (ruta única visible del sandbox): shell con vistas
// Proyectos / Workspace / Biblioteca / Estilos / Sistema. Footer sticky.
// TanStack Query (estado de servidor) + Zustand (navegación) + sonner (feedback).
// Estética «tungsteno»: display Bricolage, grano de película, marquee de métricas,
// nav pills con indicador framer-motion (layoutId) y transiciones entre vistas.

import { useState, useSyncExternalStore } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, useTheme } from 'next-themes'
import { Aperture, Clapperboard, Library, Palette, Settings, Sun, Moon } from 'lucide-react'
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
  { view: 'projects', label: 'Proyectos', icon: Clapperboard },
  { view: 'library', label: 'Biblioteca', icon: Library },
  { view: 'styles', label: 'Estilos', icon: Palette },
  { view: 'settings', label: 'Sistema', icon: Settings },
]

const emptySubscribe = () => () => {}

/** SSR-safe: false en servidor/primera pasada, true tras hidratar (sin setState en efecto). */
function useIsHydrated() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const mounted = useIsHydrated()

  // hasta hidratar, el icono no depende del tema persistido (evita mismatch de hidratación)
  const isDark = mounted && theme === 'dark'
  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative size-8 overflow-hidden rounded-full"
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={isDark ? 'sun' : 'moon'}
          initial={{ y: 12, opacity: 0, rotate: -90 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -12, opacity: 0, rotate: 90 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="flex"
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}

function Wordmark({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="group flex items-center gap-2.5 rounded-md py-0.5 pr-2"
      onClick={onClick}
      aria-label="AirShot — inicio"
    >
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_2px_10px_-2px] shadow-primary/60">
        <Aperture className="size-4 transition-transform duration-500 group-hover:rotate-90" />
      </span>
      <span className="font-display text-base font-semibold leading-none tracking-tight">
        AirShot<span className="text-primary">.</span>
      </span>
    </button>
  )
}

function NavPills({
  view,
  setView,
}: {
  view: AppView
  setView: (v: AppView) => void
}) {
  const isActive = (item: AppView) => view === item || (item === 'projects' && view === 'workspace')
  return (
    <nav className="ml-2 hidden items-center gap-0.5 rounded-full bg-secondary/70 p-1 sm:flex" aria-label="Navegación principal">
      {NAV.map((item) => {
        const active = isActive(item.view)
        return (
          <button
            key={item.view}
            className={`relative flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium leading-none transition-colors ${
              active ? 'text-background' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setView(item.view)}
            aria-current={active ? 'page' : undefined}
          >
            {active && (
              <motion.span
                layoutId="nav-pill"
                className="absolute inset-0 rounded-full bg-foreground"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <item.icon className="relative z-10 size-3.5" />
            <span className="relative z-10">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function RuntimeMarquee({ data }: { data: ReturnType<typeof useRuntimeConfig>['data'] }) {
  const items: string[] = [
    'historia → storyboard LLM → imagen / vídeo / narración IA → ensamblaje FFmpeg local',
  ]
  if (data !== undefined) {
    items.push(
      `duraciones ${data.scene.min_duration_seconds}–${data.scene.max_duration_seconds}s`,
      `máx ${data.scene.max_scenes_per_project} escenas/proyecto`,
      `máx ${data.reference.max_images_per_reference} imágenes/referencia`,
      `páginas ≤ ${data.pagination.max_page_size}`,
    )
  }
  const row = items.map((t) => (
    <span key={t} className="flex items-center gap-2.5 whitespace-nowrap">
      <span aria-hidden className="size-1 rounded-full bg-primary" />
      {t}
    </span>
  ))
  return (
    <div className="marquee-mask overflow-hidden" aria-hidden>
      <div className="marquee-track font-mono text-[10px] text-muted-foreground">
        {row}
        {row}
      </div>
    </div>
  )
}

function AirShotShell() {
  const view = useWorkspace((s) => s.view)
  const setView = useWorkspace((s) => s.setView)
  const projectId = useWorkspace((s) => s.projectId)
  const runtime = useRuntimeConfig()

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className="grain-overlay" aria-hidden />

      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <Wordmark onClick={() => setView('projects')} />
          <NavPills view={view} setView={setView} />
          <div className="ml-auto flex items-center gap-2">
            {runtime.isError && (
              <span className="flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-destructive">
                <span className="pulse-dot size-1.5 rounded-full bg-destructive" aria-hidden />
                config sin conexión
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={view === 'workspace' ? `workspace-${projectId ?? 'none'}` : view}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {view === 'projects' && <ProjectsView />}
            {view === 'workspace' && <WorkspaceView />}
            {view === 'library' && <LibraryView />}
            {view === 'styles' && <StylesView />}
            {view === 'settings' && <SettingsView />}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mt-auto border-t">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <span className="font-display text-xs font-semibold tracking-tight">
            AirShot<span className="text-primary">.</span>
          </span>
          <div className="hidden min-w-0 flex-1 lg:block">
            <RuntimeMarquee data={runtime.data} />
          </div>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground md:ml-0">
            estudio local · single-user
          </span>
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
