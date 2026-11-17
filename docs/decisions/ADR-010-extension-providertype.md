# ADR-010 — Extensión de `providerType` a `video|tts|llm|image|audio_qa` y elección de FastAPI

**Contexto.** El enunciado define `ProviderConfig.providerType: video | tts`, pero sus requisitos funcionales exigen además: mejora de historia y generación de prompts con LLM (requisito 2 y 5), generación de imágenes base con IA (requisito 6) y QA de audio con Earshot (requisito 11). También fija FastAPI como framework.

**Decisión.**

1. Ampliar el enum `providerType` a `video | tts | llm | image | audio_qa`. Es una **extensión documentada del modelo del enunciado**, no una desviación: sin `llm` y `image` los requisitos 2/5/6 no tendrían dónde configurar credenciales; sin `audio_qa` Earshot no tiene configuración propia.
2. Cada tipo nuevo recibe su puerto y factory exactamente igual que los existentes (misma mecánica de ADR-007) — la extensión no crea asimetrías.
3. FastAPI + Pydantic v2 como framework (obligatorio por enunciado): validación declarativa de DTOs con `extra="forbid"`, OpenAPI automática como documentación viva del contrato F3, async nativo para los proveedores lentos.

**Coste asumido.** Un enum más amplio que el modelo original del enunciado (documentado aquí para que no se lea como error); cinco factories en vez de dos (código repetitivo pero uniforme).

**Alternativas descartadas.**

- Quedarse en `video|tts` y meter LLM/image «aparte» sin ProviderConfig: credenciales sin cifrado uniforme (ADR-012) ni test de configuración; rompe la simetría del subsistema de proveedores.
- Un único enum plano `providerName` sin tipo: permite colisiones de nombres entre familias y pierde el tipado de configuración.
- Django/Flask en lugar de FastAPI: fuera del stack obligatorio; además Flask no trae validación ni async nativos y Django trae ORM/admin innecesarios para este diseño (repositorios propios, ADR-001).

**Relación.** F2 §2.3 (`ProviderConfig`), Anexo B (registro completo), A-01/A-05/A-06 (supuestos de endpoints concretos).
