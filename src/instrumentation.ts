// AirShot — src/instrumentation.ts
// Validación de entorno al arranque del servidor (Next 16 instrumentation hook).
// Producción: AIRSHOT_SECRET_KEY y DATABASE_URL son obligatorios (fail-fast).
// Sin AIRSHOT_API_TOKEN la API queda abierta — aceptable en local, se avisa siempre.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const missing: string[] = []
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.AIRSHOT_SECRET_KEY) missing.push('AIRSHOT_SECRET_KEY (cifrado de API keys de proveedores)')
    if (!process.env.DATABASE_URL) missing.push('DATABASE_URL (SQLite de la app)')
  }
  if (missing.length > 0) {
    throw new Error(`[airshot] entorno incompleto para producción: falta ${missing.join(', ')}`)
  }

  if (!process.env.AIRSHOT_API_TOKEN) {
    console.warn('[airshot] AIRSHOT_API_TOKEN no definido: API en modo abierto (solo recomendable en local).')
  }
}
