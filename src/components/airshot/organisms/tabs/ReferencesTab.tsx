'use client'

// AirShot — organisms/tabs/ReferencesTab: biblioteca del proyecto (creación con
// atributos dinámicos F4, imágenes upload/IA, exactly-one primaria) + asignación
// desde las escenas. Filtros type/level/q con listado paginado (cursor).

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/airshot/atoms'
import { ListOrVirtual } from '@/components/airshot/VirtualList'
import { ConsistencyPanel } from '@/components/airshot/molecules/ConsistencyPanel'
import { ReferenceCard } from '@/components/airshot/molecules/ReferenceCard'
import { ReferenceFormDialog } from '@/components/airshot/molecules/forms'
import { useReferences, useRuntimeConfig } from '@/hooks/airshot'
import type { ProjectResponse, ReferenceResponse } from '@/lib/airshot-client/types'

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
}

export function ReferencesTab({ project }: { project: ProjectResponse }) {
  const runtime = useRuntimeConfig()
  const [typeFilter, setTypeFilter] = useState<string>('__all')
  const [levelFilter, setLevelFilter] = useState<string>('__all')
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [formNonce, setFormNonce] = useState(0)
  const [editing, setEditing] = useState<ReferenceResponse | null>(null)

  const references = useReferences({
    scope: 'project',
    projectId: project.id,
    ...(typeFilter !== '__all' ? { type: typeFilter } : {}),
    ...(levelFilter !== '__all' ? { level: levelFilter } : {}),
    ...(q.trim().length > 0 ? { q: q.trim() } : {}),
  })

  const items = useMemo(() => references.data?.pages.flatMap((page) => page.items) ?? [], [references.data])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">
            consistencia visual · personajes & escenarios
          </p>
          <h3 className="mt-1.5 font-display text-lg font-semibold tracking-tight">Referencias del proyecto</h3>
          <p className="mt-1 text-xs text-muted-foreground">Personajes y escenarios con atributos dinámicos; las escenas los usan para consistencia visual.</p>
        </div>
        <div className="flex items-center gap-3 self-center">
          <span className="slug font-mono text-[10px] text-muted-foreground">
            {references.isLoading ? 'cargando…' : `${items.length}${references.hasNextPage ? '+' : ''} ${items.length === 1 ? 'referencia' : 'referencias'}`}
          </span>
          <Button size="sm" className="gap-1" onClick={() => { setEditing(null); setFormNonce((n) => n + 1); setCreateOpen(true) }}>
            <Plus className="size-3" /> Nueva referencia
          </Button>
        </div>
      </div>

      <ConsistencyPanel project={project} />

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="h-8 w-56 text-xs" />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-32 text-xs" aria-label="Filtrar por tipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">todo tipo</SelectItem>
            <SelectItem value="character">personaje</SelectItem>
            <SelectItem value="location">escenario</SelectItem>
          </SelectContent>
        </Select>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="h-8 w-28 text-xs" aria-label="Filtrar por nivel"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">todo nivel</SelectItem>
            <SelectItem value="basic">básico</SelectItem>
            <SelectItem value="advanced">avanzado</SelectItem>
            <SelectItem value="cinematic">cinemático</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {references.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!references.isLoading && items.length === 0 && (
        <EmptyState label="Sin referencias en este proyecto" hint="Créalas aquí o reutiliza las de la Biblioteca global." />
      )}

      <motion.div variants={gridVariants} initial="hidden" animate="show">
        <ListOrVirtual
          items={items}
          estimateSize={280}
          renderItem={(reference) => (
            <motion.div variants={cardVariants} className="pb-4">
              <ReferenceCard
                reference={reference}
                config={runtime.data}
                onEdit={() => { setEditing(reference); setFormNonce((n) => n + 1); setCreateOpen(true) }}
              />
            </motion.div>
          )}
          plainClassName="grid gap-4 md:grid-cols-2"
        />
      </motion.div>

      {references.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void references.fetchNextPage()}>Cargar más</Button>
        </div>
      )}

      <ReferenceFormDialog
        key={`ref-${formNonce}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        config={runtime.data}
        scope="project"
        projectId={project.id}
        editing={editing}
      />
    </div>
  )
}
