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
| `AIRSHOT_STORAGE_ROOT` | no | override de `storage.root` (la suite de tests usa `./.test-data` para que la GC nunca toque `data/` real) |

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
(`prisma/__test_*.db`, se borra al terminar), valida la recuperación de escenas
`*_pending` huérfanas y contiene:

- `providers-contract.test.ts` — contrato wire de los adaptadores externos contra un
  servidor HTTP local real (método/ruta/cabeceras/body, submit→poll→download, 401/5xx,
  propagación `traceparent`).
- `assembly-golden-path.test.ts` — camino dorado del ensamblaje con FFmpeg real
  (clips/narración/música sintéticos → `final.mp4` 9:16 + SRT + portada, progreso
  persistido, reutilización de caché y reintento). Se omite si no hay ffmpeg/ffprobe.
- `transfer.test.ts` — export/import `.airshot` con y sin media, rechazo de archivos
  inválidos y salud de datos (backup VACUUM INTO + GC de huérfanos).
- `versions.test.ts` — versionado de assets y restauración con retención por tipo.

Unitarios destacados: `zip.test.ts` (round-trip y directorio central), `timeline.test.ts`
(trim/reordenamiento), `subtitles.test.ts` (SRT base y por idioma), `batches.test.ts`
(máquina de estados pausa/reanudación) y `consistency.test.ts` (score y hallazgos). Los
archivos de test corren en serie (`fileParallelism: false`) porque comparten `data/` y la
GC borra huérfanos no referenciados por la BD de cada suite.

## Postproducción del ensamblaje

`POST /api/v1/projects/{id}/assemble` acepta, además de `includeAudio`/`musicVolume`:
`aspect` (`16:9` | `9:16` | `1:1`, desde `assembly.aspect_ratios`), `subtitles`
(`none` | `srt` | `burn`), `duckMusic` (sidechaincompress sobre la narración),
`coverSceneId` (portada JPEG del primer fotograma de esa escena), `audioLanguage` y
`subtitleLanguages` (ver doblaje). Los jobs fracasados se reintentan con
`POST /api/v1/assemblies/{jobId}/retry` (crea un job nuevo con los mismos parámetros; la
caché de segmentos normalizados evita re-renderizar los clips ya válidos).

Extras del pipeline, todos gobernados por `config/config.yaml`:

- **Ken Burns** (`assembly.still_image`): una escena sin clip recibe zoompan desde su imagen
  base durante la duración de la escena; ya no se exige vídeo para ensamblar.
- **Transiciones** (`assembly.transitions`): fade a negro con duración exacta en cada corte.
- **Alineación forzada de subtítulos** (`assembly.subtitles.align`): si `whisper-cli` y el
  modelo están disponibles, los cues SRT se alinean a la voz real; si no, se mantienen los
  tiempos acumulados estimados (degradación silenciosa y honesta).
- **Trim por escena** (`scene.min_trim_seconds`): `trimStartSeconds`/`trimEndSeconds` en la
  escena se aplican al normalizar; el editor de timeline muestra la duración efectiva.
- **Aceleración HW** (`assembly.hwaccel`): se prueba `h264_nvenc`, `h264_qsv`, `h264_amf` o
  `h264_videotoolbox` y se cae a libx264 si el encoder no está disponible.

## Generación, edición y control de calidad

- **Cola batch** — `POST /api/v1/projects/{id}/batch-generate` (`steps` image/audio/video,
  `regenerate`) encadena la generación de todas las escenas; `GET/POST /api/v1/batches/{id}`
  consulta progreso y pausa/reanuda/cancela. `batch.max_scenes` y `pause_between_ms` salen
  de config. En la UI: **Generar todo** y panel de lote en Ensamblaje.
- **Timeline** — el tab Timeline permite reordenar escenas
  (`PUT /api/v1/projects/{id}/scenes/order`), recortar clips y regenerar/re-ensamblar con
  vista previa del clip actual; los cambios de orden invalidan el ensamblaje previo.
- **Versiones y undo** — cada regeneración archiva el asset anterior
  (`GET /api/v1/scenes/{id}/versions`, `POST .../versions/{versionId}/restore`); retención
  `scene.asset_versions_max`. La UI muestra el historial por escena.
- **Consistencia** — `GET /api/v1/projects/{id}/consistency` audita cobertura de personajes
  por escena, material base por referencia y semillas visuales (`Scene.visualSeed`), con
  score y hallazgos que enlazan a la escena/referencia afectada. No llama a proveedores:
  diagnostica lo que falta para que el vídeo sea coherente.

## Publicación y portabilidad

- **Paquete de publicación** — `POST /api/v1/projects/{id}/publish` genera un ZIP con
  `final.mp4`, SRT(s), portada y manifiesto JSON (incluye metadata del proyecto y escenas).
- **Export/import `.airshot`** — `POST /api/v1/projects/{id}/export` (`includeMedia`, tope
  `transfer.max_archive_bytes`) y `POST /api/v1/projects/import` reimportan el proyecto con
  UUIDs y claves de medios nuevas; el import rechaza rutas maliciosas y CRCs inválidos,
  valida contra Zod y devuelve avisos (medios ausentes, duraciones recortadas, proveedores
  desconocidos).
- **Salud de datos** — `POST /api/v1/ops/backup` (VACUUM INTO consistente),
  `GET /api/v1/ops/media-report` (archivos totales/referenciados/huérfanos) y
  `POST /api/v1/ops/media-gc` (`apply`, bloqueado con jobs activos o escenas `*_pending`).
  La GC compara la BD con `data/` (incluye versiones, subtítulos por idioma y audios de
  traducción) y nunca toca `packages/` ni `backups/`. Todo disponible en **Sistema → Salud
  de datos**.

## Doblaje multi-idioma

`POST /api/v1/projects/{id}/translations` traduce los textos de todas las escenas con el LLM
estructurado (`translation.max_languages`); `POST .../translations/{language}/audio` sintetiza
la voz por escena e invalida el audio cuando cambia el texto; `DELETE .../translations/{language}`
borra el idioma. Al ensamblar, `audioLanguage` usa las voces dobladas y
`subtitleLanguages` produce `subtitles.<lang>.srt` además del SRT base. El estado de
cobertura (texto/voz por escena) se ve en el tab Ensamblaje.

## Observabilidad y operaciones

- `GET /api/v1/metrics` — Prometheus (`text/plain` 0.0.4): `http_requests_total`,
  `jobs_total`, `job_duration_seconds`, gauges de cola/disco/uptime/RSS. In-process: los
  contadores se reinician con el proceso.
- `GET /api/v1/ops/summary` — cola, fallos de las últimas 24 h con su código, escenas
  `*_pending`, disco y jobs fallidos recientes (con reintento desde **Sistema → Operaciones**).
- Las llamadas salientes a proveedores llevan `traceparent` W3C (compatible con
  OpenTelemetry, sin SDK) cuando hay traza activa; `x-trace-id` viaja en toda respuesta.


## Arquitectura

- `src/lib/airshot/config` — loader YAML + Zod (cero hardcoding: todo límite vive en `config/`)
- `src/lib/airshot/domain` — validadores de contrato (atributos, duraciones, prompts)
- `src/lib/airshot/services` — casos de uso (proyectos, escenas, jobs, referencias)
- `src/lib/airshot/infrastructure` — providers (Strategy/Factory), almacenamiento, FFmpeg
- `src/app/api/v1` — API REST: errores RFC 7807 (`application/problem+json`), cursor pagination
- `src/middleware.ts` — auth de instancia sobre la API
- Diseño y decisiones: [docs/architecture.md](docs/architecture.md), [docs/decisions](docs/decisions), [agents.md](agents.md)

### Limitaciones conocidas (single-process)

El runner de jobs, los semáforos de concurrencia, el rate limit y las métricas/contadores
viven en memoria del proceso. Es deliberado para uso local de un único usuario: no escales
horizontalmente varias instancias contra el mismo `data/` sin mover esos registros a un store
compartido. Al arrancar se barren jobs huérfanos de procesos anteriores.

## Medios

Los binarios (imágenes, clips, narraciones, ensamblajes) se sirven por
`/api/v1/media/...` con comprobación de contención de rutas; los archivos generados no
se versionan (`data/` está ignorado).
