# Registro de Decisiones de Arquitectura (ADR) — AirShot

Índice de ADRs. Cada registro sigue el formato: **Contexto → Decisión → Coste asumido → Alternativas descartadas**. Los ADRs complementan `docs/architecture.md` (que referencia cada uno desde la fase correspondiente) y son vinculantes para la implementación de la Fase 6.

| ADR | Título | Fase que lo motiva |
|---|---|---|
| [ADR-001](ADR-001-sqlite-sqlalchemy-repos.md) | SQLite + SQLAlchemy 2.0 async + repositorios + Alembic | F1, F2 |
| [ADR-002](ADR-002-puertos-donde-hay-variabilidad.md) | Capas con puertos/adaptadores solo donde hay variabilidad real | F1 |
| [ADR-003](ADR-003-jsonb-atributos-dinamicos.md) | Atributos dinámicos en JSONB + JSON Schema (no EAV, no columnas) | F2, F4 |
| [ADR-004](ADR-004-uuid-v4-identidad.md) | UUID v4 como identidad de todas las entidades | F2, F5 |
| [ADR-005](ADR-005-paginacion-cursor.md) | Paginación por cursor (createdAt+id; orderIndex en escenas) | F3 |
| [ADR-006](ADR-006-taxonomia-errores-rfc7807.md) | Taxonomía de 7 tipos de error + RFC 7807 | F3 |
| [ADR-007](ADR-007-strategy-factory-proveedores.md) | Strategy + Factory con registro declarativo `providers.yaml` | F1, F3, F4 |
| [ADR-008](ADR-008-frontend-vite-zustand-query.md) | Frontend Vite SPA + shadcn/ui + Zustand + TanStack Query + react-virtual | F1, F5 |
| [ADR-009](ADR-009-duration-mapper.md) | DurationMapper por proveedor para duraciones 4–15 s | F1, F3 |
| [ADR-010](ADR-010-extension-providertype.md) | Extensión de `providerType` a `video|tts|llm|image|audio_qa` y FastAPI | F1, F2 |
| [ADR-011](ADR-011-ffmpeg-subprocess.md) | Ensamblaje con FFmpeg vía subprocess encapsulado en AssemblyService | F1, F3 |
| [ADR-012](ADR-012-cifrado-api-keys.md) | Cifrado Fernet de API keys en BD y secretos por entorno | F1, F2 |
| [ADR-013](ADR-013-earshot-opcional.md) | Earshot como AudioQAProvider opcional desactivado por defecto | F1, F3 |
| [ADR-014](ADR-014-sincronismo-por-operacion.md) | Sincronismo por operación: sync corto / async largo con sondeo | F3 |
| [ADR-015](ADR-015-idioma-prompts-ingles.md) | Idioma de los prompts: inglés (historia y UI en español) | F1, F3 |

Regla de mantenimiento: cada decisión futura que afecte al núcleo (proveedores, almacenamiento, ensamblaje, esquema de atributos) exige un ADR nuevo; las ediciones de límites de negocio se hacen en `config.yaml` sin ADR.
