# ADR-011 — Ensamblaje con FFmpeg vía subprocess encapsulado en AssemblyService

**Contexto.** El enunciado exige ensamblaje con FFmpeg (subprocess o ffmpeg-python) encapsulado en un `AssemblyService` sustituible, con audio por escena y música opcional.

**Decisión.**

1. `AssemblyService` como puerto de dominio (F6 §6.4) con una implementación `FFmpegAssemblyService` que invoca `ffmpeg`/`ffprobe` mediante `asyncio.subprocess` con: lista de argumentos (sin shell, sin `shell=True`), timeout de job (`assembly.job_timeout_seconds`), codificación explícita y salida estructurada de errores.
2. Pipeline declarado (F3/E-5): normalización por clip (escala a resolución/fps/pixel format de config) → concat por `orderIndex` → mezcla de narración por escena posicionada al inicio de su segmento (duración efectiva del clip real, ADR-009) → música opcional con volumen de config y `fade_out` final → salida H.264+AAC según `assembly.*` de `config.yaml`.
3. El job es asíncrono (ADR-014) con `AssemblyJob` persistente: params inmutables (snapshot para reproducibilidad), `outputPath`/`errorMessage` (RFC 7807) al terminar.
4. `ffprobe` valida duraciones/codec de los clips ANTES de construir el comando completo (fallo rápido y clasificado, no un ffmpeg roto a mitad).

**Coste asumido.** Mantener argumentos de ffmpeg versionados y probarlos (test slow de integración previsto en §6.6); ffmpeg como dependencia del entorno (R-06: health check + instalación en Docker/Makefile).

**Alternativas descartadas.**

- MoviePy: abstracción Python sobre ffmpeg con coste de depuración mayor (trazas de errores menos claras), dependencia pesada y posibilidad de re-encode no controlada; subprocess da control total de flags.
- Celery/cola distribuida: no hay multiusuario ni escala que lo pida (anti-sobreingeniería del F1 §1.8).
- Editar en el cliente (WebCodecs): saca el ensamblaje del backend (donde el enunciado lo pide) y complica la reproducibilidad.

**Relación.** INV-09/INV-12; E-5 del contrato; requisito 9 y 10 del mapa §0.
