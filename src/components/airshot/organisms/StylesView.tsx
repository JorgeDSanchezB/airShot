'use client'

// AirShot — organisms/StylesView: estilos visuales (semillas intocables + custom),
// filtro por origen, creación/edición/borrado según reglas DELETION_FORBIDDEN.

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/airshot/atoms'
import { StyleFormDialog } from '@/components/airshot/molecules/forms'
import { useStyleCrud, useStyles, useRuntimeConfig } from '@/hooks/airshot'

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold">Estilos visuales</h2>
          <p className="text-xs text-muted-foreground">Fragmentos EN que se añaden a los prompts; los seeds son parte del producto (409 al borrar; su fragmento sí es editable).</p>
        </div>
        <Button size="sm" className="ml-auto gap-1" onClick={() => { setFormNonce((n) => n + 1); setCreateOpen(true) }}>
          <Plus className="size-3" /> Nuevo estilo
        </Button>
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

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((style) => {
          const draft = fragmentDraft[style.id] ?? style.promptFragmentEn
          return (
            <Card key={style.id} className="p-0">
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{style.name}</p>
                  <Badge variant="outline" className="text-[10px]">{style.isCustom ? 'custom' : 'seed'}</Badge>
                  {style.isCustom && (
                    <Button size="icon" variant="ghost" className="ml-auto size-6 text-destructive" aria-label={`Borrar ${style.name}`} onClick={() => void crud.remove.mutateAsync(style.id)}>
                      <Trash2 className="size-3" />
                    </Button>
                  )}
                </div>
                {style.description !== null && <p className="text-xs text-muted-foreground">{style.description}</p>}
                <textarea
                  value={draft}
                  onChange={(e) => setFragmentDraft((prev) => ({ ...prev, [style.id]: e.target.value }))}
                  className="w-full rounded-md bg-muted/60 p-2 font-mono text-xs"
                  rows={2}
                  maxLength={runtime.data?.visual_style.max_prompt_fragment_length ?? 1000}
                  aria-label={`Fragmento de ${style.name}`}
                />
                <div className="flex justify-end">
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
          )
        })}
      </div>

      {styles.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void styles.fetchNextPage()}>Cargar más</Button>
        </div>
      )}

      <StyleFormDialog key={`style-${formNonce}`} open={createOpen} onOpenChange={setCreateOpen} config={runtime.data} />
    </div>
  )
}
