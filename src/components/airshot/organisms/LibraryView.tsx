'use client'

// AirShot — organisms/LibraryView: biblioteca de referencias GLOBALES (reutilizables
// entre proyectos) con los mismos controles que la pestaña del proyecto.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/airshot/atoms'
import { ListOrVirtual } from '@/components/airshot/VirtualList'
import { ReferenceCard } from '@/components/airshot/molecules/ReferenceCard'
import { ReferenceFormDialog } from '@/components/airshot/molecules/forms'
import { useReferences, useRuntimeConfig } from '@/hooks/airshot'
import type { ReferenceResponse } from '@/lib/airshot-client/types'

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
}

export function LibraryView() {
  const runtime = useRuntimeConfig()
  const [typeFilter, setTypeFilter] = useState('__all')
  const [levelFilter, setLevelFilter] = useState('__all')
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [formNonce, setFormNonce] = useState(0)
  const [editing, setEditing] = useState<ReferenceResponse | null>(null)

  const references = useReferences({
    scope: 'global',
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
            referencias · ámbito global
          </p>
          <h2 className="mt-1.5 font-display text-xl font-semibold tracking-tight">
            Biblioteca <em className="font-serif font-normal italic text-primary">global</em>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Referencias reutilizables en cualquier proyecto (ámbito global; sin projectId).</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="slug font-mono text-[10px] text-muted-foreground">
            {references.isLoading ? 'cargando…' : `${items.length}${references.hasNextPage ? '+' : ''} ${items.length === 1 ? 'referencia' : 'referencias'}`}
          </span>
          <Button size="sm" className="gap-1" onClick={() => { setEditing(null); setFormNonce((n) => n + 1); setCreateOpen(true) }}>
            <Plus className="size-3" /> Nueva referencia global
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…" className="h-8 w-48 text-xs" />
        <div className="flex items-center gap-1.5" role="group" aria-label="Filtrar por tipo">
          {(
            [
              { value: '__all', label: 'todo' },
              { value: 'character', label: 'personaje' },
              { value: 'location', label: 'escenario' },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTypeFilter(option.value)}
              aria-pressed={typeFilter === option.value}
              className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors ${
                typeFilter === option.value
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
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
        <EmptyState label="Biblioteca vacía" hint="Crea referencias globales para reutilizarlas en todos los proyectos." />
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
        key={`libref-${formNonce}`}
        open={createOpen}
        onOpenChange={setCreateOpen}
        config={runtime.data}
        scope="global"
        projectId={null}
        editing={editing}
      />
    </div>
  )
}
