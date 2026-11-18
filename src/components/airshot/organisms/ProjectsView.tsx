'use client'

// AirShot — organisms/ProjectsView: lista infinita de proyectos + crear.

import { useState } from 'react'
import { Film, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, StatusChip } from '@/components/airshot/atoms'
import { ProjectFormDialog } from '@/components/airshot/molecules/forms'
import { useDeleteProject, useProjects, useStyles, useVoices, useRuntimeConfig } from '@/hooks/airshot'
import { useWorkspace } from '@/stores/workspace'

export function ProjectsView() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useProjects()
  const runtime = useRuntimeConfig()
  const styles = useStyles()
  const voices = useVoices()
  const openProject = useWorkspace((s) => s.openProject)
  const deleteProject = useDeleteProject()
  const [createOpen, setCreateOpen] = useState(false)

  const projects = data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Proyectos</h2>
          <p className="text-xs text-muted-foreground">Historia → storyboard → escenas con imagen/vídeo/narración → ensamblaje final.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-1">
          <Plus className="size-4" /> Nuevo proyecto
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {isError && <p className="text-sm text-destructive">No se pudo listar proyectos.</p>}
      {!isLoading && projects.length === 0 && (
        <EmptyState label="Sin proyectos todavía" hint="Crea el primero con «Nuevo proyecto»." />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.id} className="p-0">
            <CardContent className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <button className="text-left" onClick={() => openProject(project.id)}>
                  <p className="font-medium underline-offset-2 hover:underline">{project.title}</p>
                </button>
                <StatusChip status={project.status} />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Film className="size-3" />{project.sceneCount} escenas</span>
                <span className="font-mono">{project.videoProvider ?? 'sin proveedor'}</span>
                <span className="font-mono">{project.outputResolution}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {new Date(project.createdAt).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-destructive"
                  onClick={() => {
                    if (window.confirm(`¿Borrar «${project.title}» y todos sus assets?`)) {
                      void deleteProject.mutateAsync(project.id)
                    }
                  }}
                >
                  <Trash2 className="size-3" /> Borrar
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Cargando…' : 'Cargar más'}
          </Button>
        </div>
      )}

      <ProjectFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        config={runtime.data}
        styles={styles.data?.pages.flatMap((p) => p.items) ?? []}
        voices={voices.data?.pages.flatMap((p) => p.items) ?? []}
      />
    </div>
  )
}
