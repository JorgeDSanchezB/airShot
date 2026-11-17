# ADR-014 — Sincronismo por operación: síncrono corto / asíncrono largo con sondeo

**Contexto.** Las latencias de las operaciones de AirShot son heterogéneas: storyboard (LLM) ~10–60 s; generación de imagen ~5–20 s; TTS ~1–10 s; clip de video ~1–5 min; ensamblaje FFmpeg ~decenas de segundos a minutos; QA de audio minutos. Un HTTP síncrono de minutos rompe por timeouts de cliente/servidor.

**Decisión.**

1. **Síncronas** (respuesta en el mismo request, con `app.request_timeout_seconds` de config): `POST /projects/{id}/storyboard`, `POST /scenes/{id}/generate-image`, `POST /scenes/{id}/generate-audio`, CRUD completo, tests de proveedor.
2. **Asíncronas** (202 + recurso sondeable): `POST /scenes/{id}/generate-video` (estado en la propia escena: `video_pending → video_ready | failed`, con `lastError`), `POST /projects/{id}/assemble` y `POST /projects/{id}/audio-qa` (entidad `AssemblyJob`: `pending → running → completed | failed`).
3. El sondeo es del cliente (TanStack Query `refetchInterval` condicionado a estados pendientes — F5 §5.2), sin long-polling ni websockets (descartados en §1.8).
4. Los reintentos dentro de la operación async los hace el adaptador (max_retries/backoff del registro); el estado visible solo cambia al resultado final.

**Coste asumido.** Dos contratos de operación (sync/async) que el cliente debe respetar; el sondeo consume requests triviales cada pocos segundos mientras hay trabajo.

**Alternativas descartadas.**

- Todo síncrono: timeouts HTTP garantizados en video/ensamblaje; reintentos imposibles sin re-lanzar toda la operación.
- Cola de trabajos con worker (Celery/RQ/arq) para todo: infraestructura extra (broker) sin un solo usuario que la necesite; anti-sobreingeniería explícita del F1 §1.8.
- WebSockets/SSE para notificar: útiles, pero el sondeo corto en single-user local es suficiente y mantiene el contrato REST puro del enunciado; se declara reevaluación en v2 multiusuario.

**Relación.** §3.4 del contrato; E-4/E-5; estados `*_pending` de F2 §2.3; sondeo del frontend F5 §5.2.
