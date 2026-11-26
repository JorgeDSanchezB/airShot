# AirShot

Estudio local de cine con IA: una historia entra, y sale un vídeo ensamblado.
Pipeline: **historia → storyboard (LLM) → escenas con imagen/vídeo/narración IA → ensamblaje FFmpeg**.
Single-user, 100 % local, con proveedores intercambiables (Strategy + Factory) para LLM, imagen, vídeo y TTS.

## Stack

- Next.js 16 (App Router, standalone) · React 19 · TypeScript
- Prisma 6 + SQLite
- Tailwind 4 + shadcn/ui · TanStack Query · Zustand · framer-motion
- Zod (contratos) · YAML como fuente única de límites (`config/*.yaml`)
- Vitest (unit + integración) · Playwright (smoke E2E) · GitHub Actions

## Arranque rápido

Requisitos: Node.js ≥ 20 (o Bun ≥ 1.3), FFmpeg/ffprobe en PATH.

```bash
cp .env.example .env        # ajusta DATABASE_URL si quieres otra ruta
npm install                 # o: bun install
npx prisma generate
npx prisma migrate deploy   # crea/actualiza db/custom.db
npm run dev                 # http://localhost:3000
```

Abre `http://localhost:3000`, crea un proyecto en **Proyectos** y configura al menos un
proveedor por tipo en **Sistema → Proveedores** (API keys incluidas). Sin proveedores
configurados las generaciones responden `PROVIDER_NOT_CONFIGURED` (409).

### Bases de datos ya existentes (previas a las migraciones)

El repo ahora versiona migraciones. Si tienes un `db/custom.db` creado con
`prisma db push`, marca la baseline como aplicada una sola vez:

```bash
npx prisma migrate resolve --applied 0_init
```

## Variables de entorno

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `DATABASE_URL` | sí | SQLite (`file:../db/custom.db`, relativa a `prisma/schema.prisma`) |
| `AIRSHOT_SECRET_KEY` | en producción | cifra las API keys de proveedores (AES-256-GCM). Acepta base64 de 32 bytes o frase |
| `AIRSHOT_API_TOKEN` | no | si se define, `/api/v1/**` exige sesión; desbloquea en `/unlock` |

Sin `AIRSHOT_SECRET_KEY`, en desarrollo se usa una clave local derivada (con aviso);
en producción el servidor falla al arrancar (fail-fast). Sin `AIRSHOT_API_TOKEN` la
API queda abierta (modo local).

## Tests

```bash
npm run lint
npm run typecheck
npm run test        # unit + integración (SQLite temporal por suite)
npm run test:e2e    # Playwright: smoke de navegación
```

La integración ejecuta `prisma migrate deploy` contra una BD temporal
(`prisma/__test_*.db`, se borra al terminar) y valida la recuperación de escenas
`*_pending` huérfanas.

## Arquitectura

- `src/lib/airshot/config` — loader YAML + Zod (cero hardcoding: todo límite vive en `config/`)
- `src/lib/airshot/domain` — validadores de contrato (atributos, duraciones, prompts)
- `src/lib/airshot/services` — casos de uso (proyectos, escenas, jobs, referencias)
- `src/lib/airshot/infrastructure` — providers (Strategy/Factory), almacenamiento, FFmpeg
- `src/app/api/v1` — API REST: errores RFC 7807 (`application/problem+json`), cursor pagination
- `src/middleware.ts` — auth de instancia sobre la API
- Diseño y decisiones: [docs/architecture.md](docs/architecture.md), [docs/decisions](docs/decisions), [agents.md](agents.md)

### Limitaciones conocidas (single-process)

El runner de jobs, los semáforos de concurrencia y el rate limit viven en memoria del
proceso. Es deliberado para uso local de un único usuario: no escales horizontalmente
varias instancias contra el mismo `data/` sin mover esos registros a un store compartido.
Al arrancar se barren jobs huérfanos de procesos anteriores.

## Medios

Los binarios (imágenes, clips, narraciones, ensamblajes) se sirven por
`/api/v1/media/...` con comprobación de contención de rutas; los archivos generados no
se versionan (`data/` está ignorado).
