'use client'

// /unlock — desbloqueo de instancia cuando AIRSHOT_API_TOKEN está definido.
// Guarda la cookie HttpOnly vía /api/v1/auth/unlock y vuelve al estudio.

import { useState } from 'react'
import { Aperture, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Problem = { code: string; title: string; detail: string }

export default function UnlockPage() {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setProblem(null)
    try {
      const res = await fetch('/api/v1/auth/unlock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (res.ok) {
        window.location.href = '/'
        return
      }
      const body = (await res.json()) as Partial<Problem>
      setProblem({
        code: body.code ?? 'INTERNAL_ERROR',
        title: body.title ?? 'Error',
        detail: body.detail ?? `HTTP ${res.status}`,
      })
    } catch (err) {
      setProblem({ code: 'NETWORK', title: 'Sin conexión', detail: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  const openMode = problem?.code === 'STATE_CONFLICT'

  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <Aperture className="size-5 text-primary" />
          <span className="font-display text-lg tracking-tight">AirShot</span>
        </div>
        <h1 className="text-sm font-medium">Instancia protegida</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Introduce el <code className="font-mono">AIRSHOT_API_TOKEN</code> configurado en el servidor para obtener una sesión.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="token" className="text-xs">
              Token de acceso
            </Label>
            <Input
              id="token"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token de instancia"
              disabled={busy}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy || token.length === 0}>
            <KeyRound className="size-4" />
            {busy ? 'Verificando…' : 'Desbloquear'}
          </Button>
        </form>
        {problem !== null && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
            <p className="font-mono text-[11px] text-destructive">{problem.code}</p>
            <p className="mt-1">{problem.detail}</p>
            {openMode && (
              <a href="/" className="mt-2 inline-block underline underline-offset-2">
                Ir al estudio
              </a>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
