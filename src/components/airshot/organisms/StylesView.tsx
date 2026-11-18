'use client'

// AirShot — organisms/StylesView: estilos visuales (semillas intocables + custom),
// filtro por origen, creación/edición/borrado según reglas DELETION_FORBIDDEN.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/airshot/atoms'
import { StyleFormDialog } from '@/components/airshot/molecules/forms'
import { useStyleCrud, useStyles, useRuntimeConfig } from '@/hooks/airshot'

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const } },
}

export function StylesView() {
  const runtime = useRuntimeConfig()
  const [origin, setOrigin] = useState('__all')
  const styles = useStyles(origin !== '__all' ? origin : undefined)
  const crud = useStyleCrud()
  const [createOpen, setCreateOpen] = useState(false)
  const [formNonce, setFormNonce] = useState(0)
  const [fragmentDraft, setFragmentDraft] = useState<Record<string, string>>({})

  const items = styles.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">
            fragmentos EN · semillas + custom
          </p>
          <h2 className="mt-1.5 font-display text-xl font-semibold tracking-tight">
            Estilos <em className="font-serif font-normal italic text-primary">visuales</em>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Fragmentos EN que se añaden a los prompts; los seeds son parte del producto (409 al borrar; su fragmento sí es editable).</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="slug font-mono text-[10px] text-muted-foreground">
            {styles.isLoading ? 'cargando…' : `${items.length}${styles.hasNextPage ? '+' : ''} ${items.length === 1 ? 'estilo' : 'estilos'}`}
          </span>
          <Button size="sm" className="gap-1" onClick={() => { setFormNonce((n) => n + 1); setCreateOpen(true) }}>
            <Plus className="size-3" /> Nuevo estilo
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select value={origin} onValueChange={setOrigin}>
          <SelectTrigger className="h-8 w-36 text-xs" aria-label="Filtrar por origen"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">todo origen</SelectItem>
            <SelectItem value="seeded">seed (semilla)</SelectItem>
            <SelectItem value="custom">custom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {styles.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {!styles.isLoading && items.length === 0 && <EmptyState label="Sin estilos" hint="Crea un estilo custom." />}

      <motion.div variants={gridVariants} initial="hidden" animate="show" className="grid gap-4 md:grid-cols-2">
        {items.map((style) => {
          const draft = fragmentDraft[style.id] ?? style.promptFragmentEn
          return (
            <motion.div key={style.id} variants={cardVariants}>
              <Card className="group elevate-hover h-full p-0 hover:border-primary/40">
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-base font-semibold tracking-tight">{style.name}</p>
                    <Badge variant="outline" className="font-mono text-[10px] uppercase">{style.isCustom ? 'custom' : 'seed'}</Badge>
                    {style.isCustom && (
                      <Button size="icon" variant="ghost" className="ml-auto size-6 text-destructive opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Borrar ${style.name}`} onClick={() => void crud.remove.mutateAsync(style.id)}>
                        <Trash2 className="size-3" />
                      </Button>
                    )}
                  </div>
                  {style.description !== null && <p className="text-xs text-muted-foreground">{style.description}</p>}
                  <textarea
                    value={draft}
                    onChange={(e) => setFragmentDraft((prev) => ({ ...prev, [style.id]: e.target.value }))}
                    className="w-full rounded-md border border-dashed bg-muted/40 p-2 font-mono text-xs leading-relaxed transition-colors focus-visible:border-primary/40 focus-visible:outline-none"
                    rows={2}
                    maxLength={runtime.data?.visual_style.max_prompt_fragment_length ?? 1000}
                    aria-label={`Fragmento de ${style.name}`}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="slug font-mono text-[10px] text-muted-foreground">
                      {draft.length}/{runtime.data?.visual_style.max_prompt_fragment_length ?? 1000} chars · promptFragmentEn
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={draft === style.promptFragmentEn || crud.patch.isPending}
                      onClick={() => {
                        void crud.patch.mutateAsync({ id: style.id, body: { promptFragmentEn: draft } })
                          .then(() => setFragmentDraft((prev) => { const next = { ...prev }; delete next[style.id]; return next }))
                      }}
                    >
                      Guardar fragmento
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </motion.div>

      {styles.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void styles.fetchNextPage()}>Cargar más</Button>
        </div>
      )}

      <StyleFormDialog key={`style-${formNonce}`} open={createOpen} onOpenChange={setCreateOpen} config={runtime.data} />
    </div>
  )
}
