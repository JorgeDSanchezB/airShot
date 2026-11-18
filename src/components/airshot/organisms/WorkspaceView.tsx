'use client'

// AirShot — organisms/WorkspaceView: cabecera del proyecto (estado, proveedores,
// estilo, resolución, voz) + pestañas Storyboard | Referencias | Audio | Ensamblaje.

import { useState } from 'react'
import { ArrowLeft, Pencil, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusChip } from '@/components/airshot/atoms'
import { StoryboardTab } from '@/components/airshot/organisms/tabs/StoryboardTab'
import { ReferencesTab } from '@/components/airshot/organisms/tabs/ReferencesTab'
import { AudioTab } from '@/components/airshot/organisms/tabs/AudioTab'
import { AssemblyTab } from '@/components/airshot/organisms/tabs/AssemblyTab'
import { SettingsDialog } from '@/components/airshot/organisms/ProjectSettingsDialog'
import { useProject, useRuntimeConfig, useStyles, useVoices } from '@/hooks/airshot'
import { useWorkspace } from '@/stores/workspace'

export function WorkspaceView() {
  const projectId = useWorkspace((s) => s.projectId)
  const tab = useWorkspace((s) => s.tab)
  const setTab = useWorkspace((s) => s.setTab)
  const setView = useWorkspace((s) => s.setView)
  const openProject = useWorkspace((s) => s.openProject)
  const { data: project, isLoading } = useProject(projectId)
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (projectId === null) {
    return <p className="text-sm text-muted-foreground">Sin proyecto seleccionado.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" className="gap-1" onClick={() => setView('projects')}>
          <ArrowLeft className="size-4" /> Proyectos
        </Button>
        {isLoading && <Skeleton className="h-6 w-48" />}
        {project !== undefined && (
          <>
            <h2 className="text-lg font-semibold">{project.title}</h2>
            <StatusChip status={project.status} />
            <Badge variant="outline" className="font-mono text-[10px]">vid: {project.videoProvider ?? '—'}</Badge>
            <Badge variant="outline" className="font-mono text-[10px]">tts: {project.ttsProvider ?? '—'}</Badge>
            {project.visualStyleName !== null && <Badge variant="outline" className="text-[10px]">estilo: {project.visualStyleName}</Badge>}
            <Badge variant="outline" className="font-mono text-[10px]">{project.outputResolution}</Badge>
            <Badge variant="outline" className="text-[10px]">{project.sceneCount} escenas</Badge>
            <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="size-3" /> Ajustes
            </Button>
          </>
        )}
      </div>

      {project !== undefined && (
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <TabsList>
            <TabsTrigger value="storyboard">Storyboard</TabsTrigger>
            <TabsTrigger value="references">Referencias</TabsTrigger>
            <TabsTrigger value="audio">Audio</TabsTrigger>
            <TabsTrigger value="assembly">Ensamblaje</TabsTrigger>
          </TabsList>
          <TabsContent value="storyboard" className="mt-4">
            <StoryboardTab project={project} />
          </TabsContent>
          <TabsContent value="references" className="mt-4">
            <ReferencesTab project={project} />
          </TabsContent>
          <TabsContent value="audio" className="mt-4">
            <AudioTab project={project} />
          </TabsContent>
          <TabsContent value="assembly" className="mt-4">
            <AssemblyTab project={project} />
          </TabsContent>
        </Tabs>
      )}

      {project !== undefined && (
        <SettingsDialog
          key={`settings-${project.id}-${settingsOpen}`}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          project={project}
          onSaved={() => openProject(project.id)}
        />
      )}
      <Pencil className="hidden size-3" aria-hidden />
    </div>
  )
}
