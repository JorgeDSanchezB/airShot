'use client'

// AirShot — organisms/WorkspaceView: cabecera del proyecto (estado, proveedores,
// estilo, resolución, voz) + pestañas Storyboard | Referencias | Audio | Ensamblaje.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Pencil, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, StatusChip } from '@/components/airshot/atoms'
import { StoryboardTab } from '@/components/airshot/organisms/tabs/StoryboardTab'
import { TimelineTab } from '@/components/airshot/organisms/tabs/TimelineTab'
import { ReferencesTab } from '@/components/airshot/organisms/tabs/ReferencesTab'
import { AudioTab } from '@/components/airshot/organisms/tabs/AudioTab'
import { AssemblyTab } from '@/components/airshot/organisms/tabs/AssemblyTab'
import { SettingsDialog } from '@/components/airshot/organisms/ProjectSettingsDialog'
import { useProject, useRuntimeConfig, useStyles, useVoices } from '@/hooks/airshot'
import { useWorkspace } from '@/stores/workspace'

/* entrada del estudio en cascada: fade-rise escalonado, una sola vez al montar */
const viewVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
}
const riseVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
}
const tabVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
}

/* sub-nav cinematográfica: píldoras con claveta invertida en el tab activo */
const TAB_TRIGGER_CLASS =
  'h-8 flex-none rounded-full px-4 text-xs data-[state=active]:bg-foreground data-[state=active]:text-background dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-foreground dark:data-[state=active]:text-background'

export function WorkspaceView() {
  const projectId = useWorkspace((s) => s.projectId)
  const tab = useWorkspace((s) => s.tab)
  const setTab = useWorkspace((s) => s.setTab)
  const setView = useWorkspace((s) => s.setView)
  const openProject = useWorkspace((s) => s.openProject)
  const { data: project, isLoading } = useProject(projectId)
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (projectId === null) {
    return <EmptyState label="Sin proyecto seleccionado." />
  }

  return (
    <motion.div variants={viewVariants} initial="hidden" animate="show" className="space-y-5">
      <motion.div variants={riseVariants} className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button size="sm" variant="ghost" className="gap-1" onClick={() => setView('projects')}>
          <ArrowLeft className="size-4" /> Proyectos
        </Button>
        {isLoading && <Skeleton className="h-6 w-48" />}
        {project !== undefined && (
          <>
            <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />
            <h2 className="font-display text-xl font-semibold leading-tight tracking-tight">{project.title}</h2>
            <StatusChip status={project.status} />
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="slug rounded-full font-mono text-[10px]">vid: {project.videoProvider ?? '—'}</Badge>
              <Badge variant="outline" className="slug rounded-full font-mono text-[10px]">tts: {project.ttsProvider ?? '—'}</Badge>
              {project.visualStyleName !== null && (
                <Badge variant="outline" className="slug rounded-full font-mono text-[10px]">estilo: {project.visualStyleName}</Badge>
              )}
              <Badge variant="outline" className="slug rounded-full font-mono text-[10px]">{project.outputResolution}</Badge>
              <Badge variant="outline" className="slug rounded-full font-mono text-[10px]">{project.sceneCount} escenas</Badge>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto gap-1 hover:border-primary/40"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="size-3" /> Ajustes
            </Button>
          </>
        )}
      </motion.div>

      {project !== undefined && (
        <motion.div variants={riseVariants}>
          <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
            <TabsList className="h-auto gap-1 rounded-full bg-secondary/60 p-1">
              <TabsTrigger value="storyboard" className={TAB_TRIGGER_CLASS}>Storyboard</TabsTrigger>
              <TabsTrigger value="timeline" className={TAB_TRIGGER_CLASS}>Timeline</TabsTrigger>
              <TabsTrigger value="references" className={TAB_TRIGGER_CLASS}>Referencias</TabsTrigger>
              <TabsTrigger value="audio" className={TAB_TRIGGER_CLASS}>Audio</TabsTrigger>
              <TabsTrigger value="assembly" className={TAB_TRIGGER_CLASS}>Ensamblaje</TabsTrigger>
            </TabsList>
            <TabsContent value="storyboard" className="mt-4">
              <motion.div variants={tabVariants} initial="hidden" animate="show">
                <StoryboardTab project={project} />
              </motion.div>
            </TabsContent>
            <TabsContent value="timeline" className="mt-4">
              <motion.div variants={tabVariants} initial="hidden" animate="show">
                <TimelineTab project={project} />
              </motion.div>
            </TabsContent>
            <TabsContent value="references" className="mt-4">
              <motion.div variants={tabVariants} initial="hidden" animate="show">
                <ReferencesTab project={project} />
              </motion.div>
            </TabsContent>
            <TabsContent value="audio" className="mt-4">
              <motion.div variants={tabVariants} initial="hidden" animate="show">
                <AudioTab project={project} />
              </motion.div>
            </TabsContent>
            <TabsContent value="assembly" className="mt-4">
              <motion.div variants={tabVariants} initial="hidden" animate="show">
                <AssemblyTab project={project} />
              </motion.div>
            </TabsContent>
          </Tabs>
        </motion.div>
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
    </motion.div>
  )
}
