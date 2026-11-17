# ADR-013 — Earshot como AudioQAProvider opcional, desactivado por defecto

**Contexto.** El enunciado describe Earshot (github.com/Leonxlnx/earshot) como módulo de postproducción de audio (naturalidad, sincronización, loudness, artefactos, efectos de sonido) que «no forma parte del flujo básico; es una capacidad adicional seleccionable».

**Decisión.**

1. Puerto `AudioQAProvider` (F6 §6.4) con adaptador `earshot` registrado en `providers.yaml` (Anexo B) — misma mecánica que cualquier proveedor (ADR-007).
2. `audio_qa.earshot.enabled: false` por defecto en `config.yaml`: el endpoint `POST /projects/{id}/audio-qa` responde 409 si el módulo está desactivado (opt-in explícito de operador, no un toggle silencioso de API).
3. El QA de audio NO se interpone en el ensamblaje: se ejecuta a demanda sobre los audios ya generados del proyecto; su reporte (`AssemblyJob.report`) y los SFX opcionales (`generateSfx`) quedan como assets direccionables por storage keys. Reutiliza la entidad `AssemblyJob` con `jobType=audio_qa` (extensión documentada en F2 §2.3) para no crear una tercera familia de jobs paralela.
4. La integración concreta con Earshot (su contrato interno) se marca como supuesto A-06: el puerto la aísla y se estabiliza en implementación.

**Coste asumido.** Una familia de proveedor más (factory + registro + config) para una función opt-in; el adaptador es el único punto de contacto con Earshot.

**Alternativas descartadas.**

- Integrarlo siempre en el pipeline: el enunciado dice explícitamente que no es parte del flujo básico; impondría dependencia y costo a todos los usuarios.
- Servicio micro aparte para Earshot: no hay requisito de despliegue independiente (anti-sobreingeniería).
- Ejecutar QA en el cliente: el módulo es Python local; ejecutarlo en backend mantiene el frontend sin dependencias científicas.

**Relación.** Requisito 11 del mapa §0; R-05/R-11 (health check del módulo); ADR-014 (es async).
