# ADR-016 — Adaptación de la Fase 6 al runtime del sandbox (Next.js 16 + Prisma) y decisiones de implementación

| Campo | Valor |
|---|---|
| Estado | Aceptada (implementada y verificada en Fase 6) |
| Fecha | 2026-11-17 |
| Contexto | Fase 6 del documento de arquitectura (docs/architecture.md §6.1–§6.6) |
| Supersede/complementa | Complementa ADR-001, ADR-007, ADR-011, ADR-012, ADR-013, ADR-014 (no los contradice en sustancia; adapta su sustrato) |

## Contexto

La Fase 6 (implementación) debía ejecutarse en un sandbox cuyo runtime **impone**:
Next.js 16 (App Router, única ruta visible `/`), TypeScript 5, Prisma + SQLite, shadcn/ui,
un solo puerto (3000) con gateway, y `z-ai-web-dev-sdk` como SDK de IA **solo backend**.
El stack especificado en §6.1/§6.3 (FastAPI + SQLAlchemy + Vite frontend + docker compose)
no es ejecutable en este entorno (no hay segunda app, ni puerto de backend, ni Python
persistente para servir la API).

## Decisión

Implementar la Fase 6 **en el stack del sandbox**, preservando las decisiones de fondo
del documento (capas, puertos y adaptadores, cero hardcoding, taxonomía de errores,
cursor, JSONB validado, ADR-014 sync/async por operación). Mapeo aplicado:

| Especificación (§6.x) | Implementación | Notas |
|---|---|---|
| FastAPI routers (presentation) | Route handlers `src/app/api/v1/**/route.ts` (~33) | `withRoute` añade traceId, auth stub §3.1.2 y RFC 7807 |
| Pydantic v2 (`extra=forbid`) | zod v4 `z.strictObject` + mapeo a `UNEXPECTED_FIELD` | C-01 idéntico |
| SQLAlchemy 2.0 async + Alembic | Prisma + SQLite (`prisma db push`) | Sin enums nativos ni CHECK SQL: **enums y invariantes estructurales en capa de aplicación** (INV-04 aplicada en servicios — desviación consciente) |
| Repositorios (7) | Plegados en la capa de servicios | Prisma ya aporta el límite de abstracción que el patrón buscaba (problema/coste/alternativa: mantener 7 repos sobre un ORM ya abstracto duplica la capa sin variabilidad real) |
| Fernet (ADR-012) | AES-256-GCM (`AIRSHOT_SECRET_KEY`, scrypt derivada con aviso si falta) | INV-14 enmascaramiento intacto |
| `openai_compat` LLM/imagen + VoiceStudio TTS por defecto | Adaptadores **zai** (SDK) por defecto + ffmpeg-kenburns (vídeo local real) | VoiceStudio/ElevenLabs/openai_compat/veo/kling/runway/luma siguen REGISTRADOS; sin key ⇒ 409 PROVIDER_NOT_CONFIGURED fail-fast (verificable) |
| Earshot (A-06: in-process vs HTTP) | In-process: FFmpeg ebur128 + ffprobe | Métricas de sonoridad/sincronía reales; naturalness/artifacts declarados «no medibles localmente» (no se inventan) |
| Montaje estático `/media/*` | `GET /api/v1/media/{key}` con contención + Cache-Control | Misma semántica de claves y caché (§3.5) |
| Jobs async (ADR-014) | Runner in-process + sondeo GET | **B1**: barrido de huérfanos en arranque y en creación de jobs (`sweepOrphanJobs`, ventana `app.pending_stale_ms`); escenas huérfanas `video_pending` → failed con snapshot (recuperación honesta) |

Claves nuevas de config.yaml (extensión documentada, todas consumidas):
`providers.default_video` (sugerencia de UI: §3.1.4 sigue mandando override > proyecto, y
videoProvider null ⇒ 409 — sin default silencioso), `scene.composed_prompt_max_chars`,
`app.pending_stale_ms`, `audio_qa.earshot.lufs_target_min/max`, `audio_qa.earshot.sync_tolerance_seconds`,
`default_temperature` en entradas llm de providers.yaml.

## Verificación (qué se probó realmente)

- Contrato: 422s con hints/traceId/problem+json (limit=0/101, UNEXPECTED_FIELD, SENSITIVE_KEY,
  ATTRIBUTE_DEPTH anidado, INV-13 ASCII, cursor inconsistente), 409 PROVIDER_NOT_CONFIGURED
  con videoProvider null, GET /config con grupos cerrados, /health deep con versiones reales.
- Camino dorado E2E: crear proyecto → storyboard LLM (3 escenas, prompts EN, 6 s) → imagen IA
  (zai) → narración (zai TTS) → clip (ffmpeg-kenburns) → ensamblaje FFmpeg → `final.mp4`
  **18.0 s h264 720p + AAC** (ffprobe) con descarga vía /media.
- Árbitro adversarial (subagent): ronda 1 RECHAZADO (B1 livelock de jobs huérfanos, M1 política
  de imágenes por nivel no materializada, INV-13) → corregidos (B1/M1/M2/m1–m9) y re-verificados
  (huérfano running antiguo → failed PROVIDER_TIMEOUT reintentable + ensamblaje posterior 202/completed).
- UI en Agent Browser: render, tabs, creación de referencia con atributos dinámicos (§4.7
  AttributeRows), asignación a escena (chips subject/env), descarga del final, consola limpia,
  móvil 390 px, footer sticky.
- NO verificable en este entorno (declarado): wire exacto de veo/kling/runway/luma/elevenlabs/
  voicestudio sin credenciales (los adaptadores implementan el flujo submit→poll→download con
  clasificación de errores real; cualquier divergencia de forma es corregible en el archivo del
  adaptador sin tocar núcleo — regla del Carro).

## Coste aceptado

- Sin OpenAPI generado por FastAPI ni Makefile/docker-compose (§6.3): el sandbox ya fija
  `bun run dev` como vía de ejecución; los comandos reproducibles originales quedan documentados
  para un despliegue fuera del sandbox.
- `@tanstack/react-virtual` + `yaml` añadidos (el primero exigido por §5.3; el segundo para
  que config.yaml/providers.yaml/styles.yaml sigan siendo YAML — fuente única real, no TS).

## Alternativas descartadas

- **Servir el backend FastAPI como mini-servicio en otro puerto**: prohibido por el entorno
  (una sola app visible, un solo puerto público) y rompería el gateway.
- **Mock de proveedores externos para “verde” el e2e**: deshonesto (violaría la regla de
  honestidad epistémica); se prefirió proveedor local real (Ken Burns) + fail-fast para externos.
- **Mantener SQLite con CHECK SQL vía `prisma $executeRaw`**: frágil frente a `db push`
  (Prisma lo considera drift y lo revierte); las invariantes se aplican en aplicación y quedan
  cubiertas por tests de contrato del API.
