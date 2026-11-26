'use client'

// AirShot — molecules/ConsistencyPanel: auditoría honesta de consistencia
// (cobertura de personajes, imágenes base, semillas visuales y readiness).

import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useConsistency } from '@/hooks/airshot'
import type { ProjectResponse } from '@/lib/airshot-client/types'

export function ConsistencyPanel({ project }: { project: ProjectResponse }) {
  const { data, isLoading } = useConsistency(project.id)

  if (isLoading || data === undefined) {
    return <Skeleton className="h-24 w-full rounded-xl" />
  }

  const warnings = data.findings.filter((finding) => finding.severity === 'warning').length

  return (
    <Card className="p-0">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/70">auditoría de consistencia</p>
          <Badge variant={warnings > 0 ? 'destructive' : 'secondary'} className="rounded-full text-[10px]">
            {warnings > 0 ? `${warnings} aviso(s)` : 'sin avisos'}
          </Badge>
          <span className="ml-auto text-xs text-muted-foreground">
            cobertura de personajes <span className="font-mono text-foreground">{data.score}%</span>
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="slug rounded-full font-mono text-[10px]">imagen {data.assets.image}/{data.totalScenes}</Badge>
          <Badge variant="outline" className="slug rounded-full font-mono text-[10px]">audio {data.assets.audio}/{data.totalScenes}</Badge>
          <Badge variant="outline" className="slug rounded-full font-mono text-[10px]">vídeo {data.assets.video}/{data.totalScenes}</Badge>
          <Badge variant="outline" className="slug rounded-full font-mono text-[10px]">seed proyecto: {project.visualSeed ?? '—'}</Badge>
        </div>

        {data.characters.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {data.characters.map((character) => {
              const coverage = data.totalScenes === 0 ? 0 : Math.round((character.scenesReferenced / data.totalScenes) * 100)
              return (
                <div key={character.referenceId} className="rounded-lg border border-dashed p-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium">{character.name}</span>
                    <span className="slug shrink-0 font-mono text-[10px] text-muted-foreground">
                      {character.imageCount} img · {character.scenesReferenced}/{data.totalScenes} escenas
                    </span>
                  </div>
                  <Progress value={coverage} className="mt-1.5 h-1.5" />
                </div>
              )
            })}
          </div>
        )}

        {data.findings.length > 0 && (
          <ul className="space-y-1 text-xs">
            {data.findings.map((finding, index) => (
              <li key={`${finding.code}-${index}`} className="flex items-start gap-1.5 text-muted-foreground">
                {finding.severity === 'warning'
                  ? <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" aria-hidden />
                  : <Info className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />}
                <span>{finding.detail}</span>
              </li>
            ))}
          </ul>
        )}
        {data.findings.length === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3 text-emerald-500" aria-hidden /> Personajes cubiertos y material base completo.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
