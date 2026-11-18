// AirShot — infrastructure/bootstrap.ts
// Arranque idempotente: crea data/{uploads,outputs} y siembra los estilos de
// styles.yaml por MERGE sobre `name` (§2.7). Se invoca desde las rutas raíz
// de la API (una vez por proceso, con cache global).

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { airshotConfig, airshotStylesSeed } from '@/lib/airshot/config/loader'

declare global {
  var __airshotBootstrap: Promise<void> | undefined
}

async function bootstrap(): Promise<void> {
  const root = join(process.cwd(), airshotConfig.storage.root)
  mkdirSync(join(root, 'uploads'), { recursive: true })
  mkdirSync(join(root, 'outputs'), { recursive: true })
  // Semilla de estilos: MERGE idempotente por nombre
  for (const style of airshotStylesSeed) {
    const existing = await db.visualStyle.findFirst({ where: { name: style.name } })
    if (existing === null) {
      await db.visualStyle.create({
        data: {
          id: randomUUID(),
          name: style.name,
          description: style.description ?? null,
          promptFragmentEn: style.promptFragmentEn,
          isCustom: false,
        },
      })
    }
  }
  // B1 (árbitro): barrido total de jobs huérfanos al arranque — en este momento
  // el set de runners activos está vacío por definición, así que todo job
  // pending/running persistido corresponde a un proceso anterior muerto.
  const { sweepOrphanJobs } = await import('@/lib/airshot/services/jobs')
  const swept = await sweepOrphanJobs({ staleOnly: false })
  if (swept > 0) {
    console.warn(`[airshot] arranque: ${swept} job(s) huérfano(s) marcado(s) failed (PROVIDER_TIMEOUT snapshot)`)
  }
}

export function ensureBootstrap(): Promise<void> {
  if (globalThis.__airshotBootstrap === undefined) {
    globalThis.__airshotBootstrap = bootstrap().catch((err) => {
      globalThis.__airshotBootstrap = undefined
      throw err
    })
  }
  return globalThis.__airshotBootstrap
}
