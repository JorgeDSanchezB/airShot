# AirShot — Documento de Arquitectura y Planificación

| Campo | Valor |
|---|---|
| Proyecto | AirShot — generador de video asistido por IA (local, single-user) |
| Versión del documento | 1.0 |
| Tipo de entregable | Especificación vinculante de arquitectura y planificación (documento Markdown) |
| Alcance de este documento | Fases 1–5 completamente desarrolladas; Fase 6 preparada como esqueleto (sin código de implementación, según lo solicitado) |
| Registro de decisiones | `docs/decisions/` (ADR-001 … ADR-015, con índice en `docs/decisions/README.md`) |
| Registro de trabajo | `agents.md` (raíz del repositorio, actualizado al final de cada fase) |

**Declaración de honestidad epistémica (vinculante).** Este documento es un artefacto de planificación. En esta fase **no existe código de AirShot, no se ejecutaron tests, no se desplegó nada y no se validó ninguna API externa**. Toda verificación realizada fue **estática** (revisión documental adversarial por agentes independientes). Cuando una afirmación depende de comportamiento externo (por ejemplo, las duraciones exactas soportadas por Veo o Kling, o los endpoints exactos de VoiceStudio), se marca como **supuesto a verificar en implementación** con el método de verificación indicado. Ningún resultado de ejecución es afirmado. Véase la sección «Estado de verificación» al final.

**Convenciones.** Prosa en castellano. Identificadores técnicos, nombres de campos de API, prompts y artefactos de configuración en inglés. `TBD` y `TODO` están prohibidos en este documento; cualquier incertidumbre se registra como supuesto numerado (A-xx) o riesgo numerado (R-xx).

---

## 0. Mapa de trazabilidad: requisito → fase → módulo → endpoint → decisión

Este mapa es la prueba de cobertura del LISTÓN (punto 1). Cada requisito funcional del enunciado queda localizado en fases, módulos backend, componentes frontend, endpoints y ADRs.

| # | Requisito funcional | Fase | Módulo backend | Componente frontend | Endpoint(s) principal(es) | ADR |
|---|---|---|---|---|---|---|
| 1 | Ingesta de historia (pegar historia del usuario) | F1 §1.2 UC-01, F3 §3.2 | `ProjectsController`, `CreateProjectUseCase`, `ProjectRepository` | `ProjectsPage` + `ProjectForm` | `POST /api/v1/projects` | ADR-001 |
| 2 | Mejora de la historia con LLM | F1 §1.2 UC-02, F3 §3.2 | `StoryboardService` + puerto `LLMProvider` | `StoryboardList` | `POST /api/v1/projects/{id}/storyboard` | ADR-010, ADR-014 |
| 3 | Storyboard: división en escenas de 4–15 s, default 6 s | F2 §2.3 (entidad `Scene`), F3 §3.2 | Entidad `Scene`, límites de `config.yaml` (`scene.*`), `DurationMapper` | `StoryboardList`, `DurationSlider` | `PATCH /api/v1/scenes/{id}`, `GET /api/v1/config` | ADR-009 |
| 4 | Biblioteca de referencias con niveles (basic/advanced/cinematic) y ámbito (global/proyecto) | F2 §2.3, F4 completo | `ReferenceRepository`, `ReferenceValidator`, `ReferenceFactory` | `ReferenceLibrary`, `ReferenceForm`, `ReferenceCard` | `/api/v1/references` (CRUD + imágenes) | ADR-003 |
| 5 | Prompts visuales en inglés por escena | F1 §1.3 (supuesto A-03), F3 §3.2 | `PromptComposer` (dominio) | `PromptEditor` | `PATCH /api/v1/scenes/{id}` | ADR-015 |
| 6 | Imágenes base por escena: generadas con IA o subidas | F3 §3.2 | Puertos `ImageProvider` + `StorageService`, validación de subidas | `AssetPreview` (+ `SceneCard`) | `POST /api/v1/scenes/{id}/generate-image`, `POST /api/v1/scenes/{id}/image` | ADR-010, ADR-002 |
| 7 | Proveedores de video intercambiables (Veo, Kling, Runway, Luma…) | F1 §1.5, F2 §2.6, F3 §3.2, F4 §4.8 | Puerto `VideoProvider` + `VideoProviderFactory` + registro `providers.yaml` | `ProviderSettingsForm`, `GenerateVideoDialog` | `POST /api/v1/scenes/{id}/generate-video`, `/api/v1/provider-configs` | ADR-002, ADR-007 |
| 8 | TTS con VoiceStudio (local, default) o ElevenLabs | F3 §3.2 | Puerto `TTSProvider` + `TTSProviderFactory` | `AudioPanel`, `VoicePicker` | `POST /api/v1/scenes/{id}/generate-audio`, `GET /api/v1/tts/voices` | ADR-007, ADR-010 |
| 9 | Ensamblaje final (clips + audio en video final) | F3 §3.2 | `AssemblyService` (FFmpeg, encapsulado) | `AssemblyPanel` | `POST /api/v1/projects/{id}/assemble`, `GET /api/v1/assemblies/{jobId}` | ADR-011, ADR-014 |
| 10 | Música opcional en el ensamblaje | F3 §3.2 | `AssemblyService` (mezcla con volumen/fade configurable) | `MusicPicker` | `POST /api/v1/projects/{id}/music`, `POST /api/v1/projects/{id}/assemble` | ADR-011 |
| 11 | Earshot como módulo opcional de QA de audio (desactivado por defecto) | F1 §1.5, F3 §3.2 | Puerto `AudioQAProvider`, adaptador `earshot` | `AudioQAPanel` (opt-in explícito) | `POST /api/v1/projects/{id}/audio-qa` | ADR-013 |
| 12 | Estilos visuales reutilizables (biblioteca + custom) | F2 §2.3, F3 §3.2 | `VisualStyleRepository` + seed idempotente | `StylePicker` | `/api/v1/visual-styles` (CRUD) | ADR-001 |

Requisitos transversales del LISTÓN (paginación por cursor, virtualización, taxonomía de 7 tipos de error, cero hardcoding, extensibilidad sin tocar el núcleo) están asignados así: paginación → F3 §3.1 (todas las colecciones); virtualización y claves estables → F5 §5.3–5.4; taxonomía de errores → F3 §3.1 (tabla canónica) aplicada en F2 §2.3–2.4, F4 §4.6 y F5 §5.4; cero hardcoding → Anexo A (`config.yaml` completo) y §1.9; extensibilidad de proveedores → F4 §4.8 y ADR-007; extensibilidad de atributos → F4 §4.2–4.5 y ADR-003.

---

## FASE 1 — Plan Estratégico (Frontend & Backend)

### 1.1 Objetivo y alcance

AirShot es una aplicación web **local y de usuario único** que convierte una historia escrita por el usuario en un video ensamblado. Cadena de valor:

```
historia (es) → mejora LLM → storyboard (escenas ~6 s, 4–15 s)
            → prompts visuales (en) + referencias (personajes/escenarios, niveles)
            → imágenes base (IA o subida) → clips de video (proveedor intercambiable)
            → narración TTS (VoiceStudio | ElevenLabs) [+ QA de audio opcional Earshot]
            → ensamblaje FFmpeg (+ música opcional) → video final
```

Alcance de la versión 1:

- Incluido: todo el flujo anterior, biblioteca de referencias global/de proyecto con niveles, estilos visuales, configuración cifrada de proveedores, ensamblaje con música opcional, módulo opcional Earshot (desactivado por defecto).
- Excluido (y documentado para no ambigüedad): subtítulos, multiusuario real, autenticación real, generación de guiones desde cero (la historia la escribe el usuario), exportación a plataformas externas, cola de trabajos distribuida, facturación.

**Preparación para multi-tenant sin reescribir el núcleo** (requisito del enunciado): ver §1.10. La decisión es no implementar auth ahora, pero dejar `Depends(get_current_user)` como contrato único de identidad y repositorios que reciben el contexto de usuario, de modo que añadir JWT/OAuth + `tenant_id` sea aditivo (columna + filtro en repos), no estructural.

### 1.2 Actores y casos de uso

Actores:

1. **Usuario básico** — pega su historia y ejecuta el flujo automático hasta el video final; interviene solo para revisar y confirmar.
2. **Usuario avanzado** — edita storyboard (texto, prompt, duración 4–15 s), elige nivel de referencias, elige proveedor de video y TTS, activa Earshot, sube música, ajusta parámetros de ensamblaje.
3. **Bibliotecario de referencias** (rol del mismo usuario) — crea personajes/escenarios con IA o subiéndolos, decide ámbito global o de proyecto, gestiona imágenes de referencia.

Casos de uso (el manejo de errores de cada UC sigue la taxonomía canónica de F3 §3.1; aquí solo se listan los flujos principales y alternos clave):

| UC | Nombre | Actor | Flujo principal | Flujo alterno relevante |
|---|---|---|---|---|
| UC-01 | Crear proyecto con historia | básico | `POST /projects` → proyecto `draft` con `originalStory` | título vacío/largo → 422 `VALIDATION_ERROR` |
| UC-02 | Generar storyboard | básico | `POST /projects/{id}/storyboard` → LLM mejora historia + divide en escenas (default 6 s) + `promptEn` por escena | LLM produce JSON inválido → reintentos → 502 `LLM_INVALID_OUTPUT` |
| UC-03 | Editar escena | avanzado | `PATCH /scenes/{id}` (texto, prompt, duración, fuente de narración) | duración fuera de rango → 422 (rango leído de `GET /config`, no fijo en frontend) |
| UC-04 | Gestionar referencias | bibliotecario | CRUD `/references` + imágenes (subida o IA) + nivel + ámbito | atributo no permitido/sensible → 422 (`SENSITIVE_KEY` / `ATTRIBUTE_LIMIT`) |
| UC-05 | Asignar referencias a escena | avanzado | `PUT /scenes/{id}/references` (subject/environment) | excede tope por escena → 422 (tope desde `config.yaml`) |
| UC-06 | Imagen base por escena | básico/avanzado | generar con IA o subir → `imageBasePath` + `status=image_ready` | subida > tamaño/mimetype → 413/415 |
| UC-07 | Generar clip de video | básico | `POST /scenes/{id}/generate-video` → 202 async → sondeo de escena | proveedor no configurado → 409 `PROVIDER_NOT_CONFIGURED`; timeout → 504 `PROVIDER_TIMEOUT` |
| UC-08 | Generar narración | básico | `POST /scenes/{id}/generate-audio` (VoiceStudio default) | VoiceStudio caído → 503 `PROVIDER_UNAVAILABLE` con indicación de cambiar a ElevenLabs |
| UC-09 | Ensamblar proyecto | básico | `POST /projects/{id}/assemble` → 202 job → `final.mp4` | escenas incompletas → 409 `ASSEMBLY_INCOMPLETE_SCENES` |
| UC-10 | Configurar proveedores | avanzado | `/provider-configs` (API key cifrada) + `POST /{id}/test` | key inválida → 502 `PROVIDER_AUTH` con remediación |
| UC-11 | QA de audio opcional | avanzado | `POST /projects/{id}/audio-qa` (Earshot opt-in) | Earshot no disponible → 503 con diagnóstico |
| UC-12 | Música opcional | avanzado | subir pista + volumen en assemble | formato no permitido → 415 |
| UC-13 | Biblioteca de estilos | avanzado | CRUD `/visual-styles`; estilos seed no eliminables | borrar seed → 409 `DELETION_FORBIDDEN` |
| UC-14 | Flujo automático completo | básico | orquestación cliente de UC-02 → UC-06/07/08 por escena → UC-09 | pausa/reanuda por escena; sin ejecución silenciosa en segundo plano |

### 1.3 Supuestos (documentados; cada uno indica cómo invalidarlo o verificarlo)

| ID | Supuesto | Motivo | Cómo verificar / invalidar |
|---|---|---|---|
| A-01 | El usuario aporta sus propias API keys (Veo, Kling, ElevenLabs, LLM, image-gen); AirShot no cobra nada | Enunciado: «El usuario tiene sus propias API keys» | No aplicable (definición de producto) |
| A-02 | Las APIs de video aceptan image-to-video con duración variable; las duraciones soportadas difieren por proveedor | Enunciado; documentación pública de Veo/Kling | Verificación en implementación: `POST /provider-configs/{id}/test` consulta capabilities y persiste lo observado en `ProviderConfig.lastCheck` advirtiendo divergencias con el registro; `providers.yaml` es versionado y se actualiza solo manualmente (los valores del Anexo B son defaults verificables) |
| A-03 | Los prompts visuales se generan en inglés (mejor rendimiento de modelos); la historia mejorada y la UI están en español | Enunciado + práctica común de modelos de imagen/video | Comparativa cualitativa en implementación; no se afirma nada cuantitativo ahora |
| A-04 | Veo expone API vía Gemini/Vertex con duraciones discretas {4, 6, 8} s; Kling {5, 10} s | Enunciado («Veo: 4/6/8 s; Kling: 5/10 s») | Contraste con documentación oficial del proveedor en implementación; el `DurationMapper` hace el ajuste, por lo que un dato erróneo no rompe el núcleo |
| A-05 | VoiceStudio local escucha en `http://localhost:3900/v1` con API compatible OpenAI (endpoint de síntesis tipo `/audio/speech` y listado de voces) | Enunciado | Sondeo `GET /api/v1/health?deep=true` en implementación; el puerto `TTSProvider` aísla cualquier desviación |
| A-06 | Earshot (github.com/Leonxlnx/earshot) se integra como módulo Python local invocable desde el backend; su contrato interno se estabiliza en implementación | Enunciado | Revisión del repositorio en implementación; el puerto `AudioQAProvider` aísla la integración |
| A-07 | Usuario único, sin autenticación real; existe un «usuario local» por defecto | Enunciado | Producto definido |
| A-08 | La narración de una escena usa por defecto `improvedText` (`narrationSource=improved`), alternativas `original`/`custom` | Decisión de diseño (texto mejorado ya está sincronizado con el storyboard) | Configurable por escena; cambio sin migración |
| A-09 | Sin subtítulos en v1 | Enunciado | Producto definido |
| A-10 | El LLM puede devolver JSON estructurado (response_format json_schema) o se fuerza con validación + reintentos | Comportamiento estándar de LLMs actuales | Pruebas de contrato con fixtures grabadas en implementación |
| A-11 | SQLite es suficiente para el volumen local (decenas de proyectos, miles de escenas) | Single-user local | Límites declarados en §3.1; migración a PostgreSQL prevista sin tocar dominio (ADR-001) |
| A-12 | FFmpeg/ffprobe están disponibles en el entorno de ejecución (instalados por la imagen Docker o el Makefile) | Enunciado (ensamblaje FFmpeg) | `GET /api/v1/health` comprueba versión de ffmpeg en implementación |

### 1.4 Riesgos y mitigaciones

| ID | Riesgo | Impacto | Mitigación diseñada |
|---|---|---|---|
| R-01 | Costo variable de APIs externas (lo asume el usuario) | financiero | Antes de cada generación por lote, la UI muestra resumen (n.º escenas × duración efectiva por proveedor). No hay cobro desde AirShot |
| R-02 | Duraciones soportadas distintas por proveedor | funcional | `DurationMapper` por proveedor (ADR-009) con redondeo documentado y advertencia en UI cuando la duración efectiva ≠ solicitada |
| R-03 | Límite de imágenes de referencia por proveedor (Veo hasta 3; otros varían) | funcional | `reference_image_limit` por proveedor en `providers.yaml` + política por nivel (§2.6) + selección de imágenes primarias en el payload |
| R-04 | Términos de servicio / licencias de contenido de proveedores | legal | Documentado: la responsabilidad del contenido y del uso de las APIs es del usuario; AirShot no distribuye contenido. No se da asesoría legal |
| R-05 | VoiceStudio no disponible (local caído) | disponibilidad | Health check profundo + error 503 con remediación explícita («cambia a ElevenLabs o levanta VoiceStudio»); nunca fallback silencioso |
| R-06 | FFmpeg ausente o de versión distinta | bloqueo ensamblaje | Health check + instalación declarada en Docker/Makefile; `AssemblyService` encapsula para sustituir por alternativa (ADR-011) |
| R-07 | LLM devuelve JSON malformado o escenas fuera de límites | flujo | Validación Pydantic del output + `llm.max_retries` + 502 `LLM_INVALID_OUTPUT` con detalle |
| R-08 | Historias muy largas → storyboards enormes | memoria/tiempo | `scene.max_scenes_per_project` configurable; división por lotes en `StoryboardService`; paginación por cursor en listas |
| R-09 | Pérdida de API keys | seguridad | Cifrado Fernet en reposo (ADR-012), enmascarado en respuestas, nunca en logs |
| R-10 | Deprecación/cambio de API de un proveedor | mantenimiento | Aislamiento en adaptadores (ADR-002/007); el resto del sistema no conoce endpoints |
| R-11 | Earshot no disponible o con contrato inestable | QA de audio (módulo opcional) bloqueado | Health check profundo + 503 `PROVIDER_UNAVAILABLE` con remediación; el pipeline principal no depende de Earshot (ADR-013) |

### 1.5 Arquitectura general

Modelo: **arquitectura en capas simplificada con puertos y adaptadores solo donde hay variabilidad real** (ADR-002). No microservicios, no CQRS, no event sourcing, no GraphQL (todas descartadas en §1.9 con motivo).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ PRESENTACIÓN                                                                  │
│  Backend: FastAPI routers (presentation/api)   Frontend: React+Vite SPA       │
└───────────────┬──────────────────────────────────────┬───────────────────────┘
                │ use cases (application)               │ TanStack Query + Zustand
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ APLICACIÓN — casos de uso orquestando dominio e infraestructura                │
│  CreateProject, GenerateStoryboard, GenerateSceneImage, GenerateSceneVideo,    │
│  GenerateSceneAudio, AssembleProject, RunAudioQA, CRUD de referencias/estilos │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────────────┐
│ DOMINIO — entidades (Project, Scene, Reference, VisualStyle, ProviderConfig,  │
│  AssemblyJob, SceneReference), servicios puros (PromptComposer,               │
│  DurationMapper, ReferenceValidator), puertos (interfaces) y enums            │
└───────┬──────────────────────────┬─────────────────────────┬─────────────────┘
        │                          │                         │
┌───────▼────────┐        ┌────────▼─────────────┐   ┌──────▼──────────────────┐
│ PERSISTENCIA   │        │ PROVEEDORES EXTERNOS  │   │ MEDIOS DE EJECUCIÓN      │
│ SQLAlchemy 2.0 │        │ ports → adapters:     │   │ StorageService (FS local │
│ async + repos  │        │ Video(TTS/LLM/Image/  │   │ ./data), AssemblyService │
│ (SQLite→PG)    │        │ AudioQA) providers    │   │ (FFmpeg subprocess)      │
└────────────────┘        └───────────────────────┘   └─────────────────────────┘
```

**Por qué este modelo y no otro** (problema → coste → alternativa descartada):

- Problema que resuelve: (a) los proveedores externos son intercambiables por requisito (Veo/Kling/Runway/Luma; VoiceStudio/ElevenLabs; LLM; image-gen; Earshot); (b) SQLite→PostgreSQL y FS local→S3 son migraciones previstas; (c) FFmpeg puede sustituirse.
- Coste que introduce: indirección (puertos + repositorios + inyección en el composition root). Aceptado porque la variabilidad es real y está en el enunciado.
- Alternativa descartada: (1) hexagonal estricto con capa anti-corrupción por cada proveedor — sobreingeniería para un single-user local (no hay traducción de modelos de dominio externos que justifique ACL formal); (2) arquitectura «big ball of mud» con SDKs importados en los use cases — acopla el núcleo a endpoints concretos y viola la regla del enunciado de intercambiabilidad; (3) microservicios — no hay necesidad de escalado independiente ni de despliegue distribuido (coste operativo alto, beneficio nulo en local).

Módulos concretos (árbol completo en Fase 6 §6.2):

- `app/core`: `config.py` (Pydantic Settings sobre `config.yaml` + env), `errors.py` (taxonomía + RFC 7807), `logging.py`.
- `app/domain`: `entities/`, `ports/`, `services/` (puros, sin I/O), `enums.py`.
- `app/application`: casos de uso por operación de negocio.
- `app/infrastructure`: `persistence/` (SQLAlchemy + repos), `providers/` (adaptadores + `registry.py` + `providers.yaml`), `storage/`, `assembly/`.
- `app/presentation`: routers FastAPI, schemas Pydantic de request/response, dependencies.

Frontend (organización Átomos → Moléculas → Organismos → Páginas):

- **Átomos** (shadcn/ui + wrappers finos): `Button`, `Badge`, `DurationSlider`, `StatusChip`, `TextField`, `ConfirmDialog`.
- **Moléculas**: `SceneCard`, `ReferenceCard`, `ReferenceForm`, `AudioPanel`, `GenerateVideoDialog`, `PromptEditor`, `AssetPreview`, `VoicePicker`, `LevelSelector`, `AttributeRows` (render dinámico de §5.4), `ErrorNotice` (problema RFC 7807 → mensaje accionable).
- **Organismos**: `StoryboardList` (virtualizado), `ReferenceLibrary` (virtualizado), `ProviderSettingsForm`, `AssemblyPanel`, `AudioQAPanel`, `MusicPicker`, `StylePicker`, `ProjectForm`.
- **Páginas** (react-router-dom): `ProjectsPage` (lista + crear), `ProjectWorkspacePage` (pestañas: Storyboard / Referencias / Activos / Audio / Ensamblaje / QA), `SettingsPage` (proveedores).

### 1.6 Gestión de estado (justificación detallada)

- **Estado de servidor** (proyectos, escenas, referencias, estilos, configs, jobs): TanStack Query. Problema que resuelve: caché, reintentos, listas infinitas con cursor (`useInfiniteQuery`), invalidación tras mutaciones, evita condiciones de carrera de `useEffect`+fetch manual. Coste: convención de claves y boilerplate de invalidación. Alternativa descartada: `useEffect` + estado local (condiciones de carrera y stale reads), Redux RTK Query (boilerplate mayor sin beneficio aquí), SWR (soporte de listas infinitas con cursor menos directo en escenarios de invalidación encadenada).
- **Estado de cliente** (pestaña activa, escena seleccionada, borradores del editor de prompt, ajustes de vista): Zustand. Problema: estado UI efímero compartido entre organismos sin prop drilling. Coste: disciplina de no duplicar estado de servidor. Alternativa descartada: Redux Toolkit (boilerplate de actions/reducers para una app single-user local), Context API (re-renders en cascada que dañan listas virtualizadas).
- **Regla de propiedad**: cada dato vive en exactamente un lugar. Nada que venga del API se guarda en Zustand; nada puramente UI se mete en TanStack Query.

### 1.7 Decisiones tecnológicas (resumen; detalle en ADRs)

| Decisión | ADR | Resumen de justificación | Alternativa descartada |
|---|---|---|---|
| FastAPI + Pydantic v2 | ADR-010 (contexto) | Async nativo para llamadas a proveedores lentos, validación declarativa, OpenAPI automática | Django (ORM monolítico y peso innecesario), Flask (sin validación ni async nativos) |
| SQLite + SQLAlchemy 2.0 async + repositorios | ADR-001 | Local, portable, sin servidor; repos abstraen para migrar a PG | PostgreSQL en local (servidor innecesario v1), SQLModel (menos maduro para el mix async/JSONB usado) |
| Alembic para migraciones | ADR-001 | Historial versionado del esquema; ruta SQLite→PG | `create_all` (sin historial ni retrocompatibilidad) |
| Atributos dinámicos en JSONB (TEXT JSON en SQLite) + JSON Schema | ADR-003 | Extensibilidad sin migraciones (regla del enunciado) | EAV (consultable pero complejo; no hay requisito de filtrar por atributo), columnas fijas (rígido) |
| UUID v4 como identidad | ADR-004 | Claves estables en frontend y en reordenaciones (LISTÓN exige «nunca el índice») | INTEGER autoincrement (inestable para keys de React en listas editables) |
| Paginación por cursor (createdAt+id; order_index en escenas) | ADR-005 | Escalable con n grande; sin saltos ni duplicados bajo inserciones | OFFSET (degradación O(n) y duplicados con datos cambiantes) |
| Taxonomía de 7 tipos de error + RFC 7807 | ADR-006 | Distingue ausente/nulo/inválido/temporal/auth/config/crítico y no oculta | Excepciones genéricas con mensaje plano; códigos ad hoc inconsistentes |
| Strategy + Factory con registro `providers.yaml` | ADR-007 | Añadir proveedor = nuevo adaptador + entrada de registro, sin tocar núcleo | if/else por proveedor (vierte detalles de cada API en el núcleo) |
| React 18 + TS + Vite SPA | ADR-008 | Herramienta local de una página; sin SSR no se justifica Next | Next.js (SSR/RSC innecesarios para un cliente local contra API propia) |
| shadcn/ui (Radix + Tailwind) | ADR-008 | Accesibilidad incluida, consistencia visual | Librería de componentes con runtime pesado o CSS desde cero |
| Zustand + TanStack Query + @tanstack/react-virtual | ADR-008 | §1.6 + virtualización del LISTÓN | Redux Toolkit / Apollo / renderizado completo de listas |
| `DurationMapper` por proveedor | ADR-009 | Mapea 4–15 s del usuario a duraciones soportadas | Rechazar duraciones no exactas (rompe el flujo) |
| Extensión de `providerType` a `video|tts|llm|image|audio_qa` | ADR-010 | El enunciado exige LLM (mejora+prompts), imágenes base por IA y Earshot; su modelo solo tipaba `video|tts` | Quedarse en dos tipos (obligaría a mezclar LLM/image en tablas ajenas) |
| FFmpeg vía subprocess encapsulado en `AssemblyService` | ADR-011 | Control total de argumentos, sin shell, timeout configurable; sustituible | MoviePy (abstracción con coste de depuración mayor y dependencia pesada), Celery/cola distribuida (innecesario) |
| Cifrado Fernet de API keys + secretos por env | ADR-012 | Reposo cifrado; nunca en config versionado | Claves en `config.yaml` (fugas por VCS), claves en claro (inaceptable) |
| Earshot como `AudioQAProvider` desactivado por defecto | ADR-013 | Módulo opcional del enunciado; sin costo cuando no se usa | Integrarlo al pipeline siempre (costo y dependencia sin requisito) |
| Sincronismo por operación: storyboard/imágenes/audio sync; video/assembly/audio-qa async | ADR-014 | Latencias: LLM/image/TTS segundos; video/ffmpeg minutos → 202 + sondeo | Todo síncrono (timeouts HTTP), todo job-queue (sobreingeniería v1) |
| Idioma de los prompts: inglés (historia y UI en español) | ADR-015 | Rendimiento cualitativo de modelos de imagen/video (supuesto A-03); INV-13 lo refuerza | Prompts en español (degradación esperada de calidad) |

### 1.8 Anti-sobreingeniería: patrones usados y patrones descartados

Tabla de patrones usados (problema → coste → alternativa descartada). El resto de patrones del mercado se declara **descartado** con motivo:

| Patrón usado | Problema que resuelve | Coste introducido | Alternativa descartada |
|---|---|---|---|
| Capas + puertos (variabilidad real) | Intercambio de proveedores/DB/storage | Indirección | Núcleo acoplado a SDKs concretos |
| Repository | Migración SQLite→PG sin tocar dominio | Boilerplate | Consultas dispersas en use cases |
| Strategy + Factory (proveedores) | N proveedores con misma interfaz | Registro + config | if/else en use cases |
| DTO Pydantic (request/response) | Validación de contrato y OpenAPI | Duplicación entidad/DTO | Entidades expuestas directo (acoplamiento HTTP↔persistencia) |
| Cursor pagination | Listas escalables estables | Codificación opaca de cursor | OFFSET/LIMIT |
| JSONB + JSON Schema | Atributos dinámicos | Validación imperativa de profundidad | EAV / columnas fijas |
| Virtualización (@tanstack/react-virtual) | DOM acotado con miles de escenas | Estimación de alturas y medición | Renderizar todo |
| React.memo + comparador | Evitar re-render de 200 tarjetas al parchear una | Mantener comparador | Re-render completo |

**Descartados explícitamente** (porque no hay requisito que los justifique y su costo sí existe): microservicios, event sourcing, CQRS, GraphQL, message broker/cola distribuida, OAuth server propio, k8s, i18n multi-idioma (UI solo español, supuesto A-03), caché Redis (la memoria local del cliente TanStack Query basta), autenticación multiusuario real en v1 (queda el hueco §1.10), websockets (el sondeo corto es suficiente en single-user; se reevalúa en v2 si se añade multiusuario).

### 1.9 Cero hardcoding: estrategia de configuración

- Fuente única: `config.yaml` (Anexo A, completo) validado en arranque por Pydantic Settings (`app/core/config.py`); override por variables de entorno para secretos (`AIRSHOT_SECRET_KEY`). Todo límite del sistema referenciado en este documento tiene clave de config: duraciones de escena (§2.3), límites de atributos (§4.2), tamaños de subida (§3.2), paginación (§3.1), timeouts/reintentos/concurrencia por proveedor (Anexo B), parámetros de ensamblaje (§3.2), longitudes de texto de entidades (§2.3: `story.*`, `reference.*`, `visual_style.*`), imágenes de referencia por nivel (§2.6: `reference.level_image_limits`) y caché de media (§3.5: `media.*`).
- `GET /api/v1/config` expone en runtime los límites efectivos de solo lectura para que el frontend NO duplique constantes de negocio (el slider de duración toma min/default/max de ahí, no de un literal).
- Constantes técnicas permitidas y justificadas (no son negocio): versión del esquema de atributos `v1`; `UUID` versión 4; encoding JSON UTF-8; base de rutas `/api/v1`; los umbrales de virtualización del frontend (`threshold: 50`, alturas estimadas) por ser constantes de rendimiento de UI documentadas en `src/config/app.config.ts` con justificación (§5.3); nombre del usuario local por defecto (`local-user`, de `config.yaml app.local_user_id`); el rango físico `(0, 1]` de `musicVolume` (fracción de mezcla, no límite de negocio).
- Los límites del negocio **no** se duplican como CHECKs SQL con literales (§2.4 explica por qué: mantenerlos configurables); solo invariantes estructurales van a la BD.

### 1.10 Preparación multi-tenant (sin implementar ahora)

1. `Depends(get_current_user)` es el único punto de identidad; hoy devuelve `LocalUser` fijo (de config). JWT/OAuth futuro = mismo contrato, otra implementación (sin tocar controllers).
2. Los repositorios reciben el contexto de usuario en su constructor por sesión; añadir `tenant_id` será: columna nullable + filtro en repos (ADR-001) — cambio aditivo, el dominio no conoce tenancy.
3. `StorageService` ya direcciona por `projectId` (rutas `outputs/projects/{projectId}/...`), por lo que el aislamiento de ficheros ya es por proyecto y admite prefijo de tenant futuro.
4. Límite honesto: no hay aislamiento real hoy porque no hay autenticación; esta sección declara el camino, no un estado.

---

## FASE 2 — Modelado de Datos (Base Sólida)

### 2.1 Entidad base

`IEntity` (interfaz de dominio): `id: UUID` y `createdAt: datetime` (UTC, ISO 8601). Implementación en SQLite: `id` como `TEXT(36)` con valor `uuid4` generado por el dominio (no por la BD); `createdAt` como `DateTime` con timezone serializado ISO en SQLite. Las FKs con `ON DELETE` solo se aplican si el engine activa `PRAGMA foreign_keys=ON` por conexión (event listener del engine — ADR-001).

Justificación del UUID v4 (ADR-004). Problema: el LISTÓN exige claves estables en frontend («nunca el índice») y las listas son editables (reordenar/borrar inserta huecos en índices autoincrementales). Coste: índices con insert order aleatorio (fragmentación); aceptable en SQLite local con decenas de miles de filas. Alternativa descartada: `INTEGER PRIMARY KEY` autoincrement (claves de React inestables en listas editables; además impide fusionar datos multi-tenant futuros sin colisiones).

### 2.2 Diagrama entidad-relación

```
Project 1 ──── n Scene
Project 1 ──── n AssemblyJob
Project 1 ──── 0..1 musicAsset (storage key)
Scene   n ──── n Reference        (a través de SceneReference, kind: subject|environment)
Project * ── 0..1 VisualStyle   (un proyecto referencia 0..1 estilo; un estilo puede usarse en muchos proyectos; FK nullable visual_style_id)
Reference: project_id nullable  ⇔  library_scope ∈ {global, project}
ProviderConfig: sin FK (proveedores independientes de proyectos; el proyecto guarda el *nombre* del proveedor activo)
```

El modelo relacional completo (columnas, tipos, nulidad) se declara en SQLAlchemy 2.0 `Mapped`/`mapped_column` con tipos dialecto-conscientes: `JSONVariant` = `sa.JSON().with_variant(postgresql.JSONB, "postgresql")` para que la misma definición de columnas sea JSONB nativa en PostgreSQL y TEXT-JSON en SQLite (ruta de migración ADR-001/ADR-003).

### 2.3 Entidades (especificación completa de campos)

Formato de las tablas: **nulidad** y **semántica del null** siguen la taxonomía canónica de F3 §3.1 (null ≠ ausente). «Config» indica la clave de `config.yaml` (Anexo A) que gobierna cualquier límite mencionado — cero hardcoding. `createdAt` (y `updatedAt` donde procede) heredan de `IEntity` (§2.1) en todas las entidades y no se repiten fila a fila.

#### Project

| Campo | Tipo | Nulidad / semántica | Restricciones |
|---|---|---|---|
| `id` | UUID | no nulo | PK |
| `title` | TEXT | no nulo | longitud ≥ 1 y ≤ `story.max_title_length` (200) — validado en API |
| `originalStory` | TEXT | no nulo | longitud ≤ `story.max_original_story_length` (100000) |
| `improvedStory` | TEXT | **null = aún no se ha generado el storyboard** (documentado, no «vacío») | se llena en UC-02 |
| `visualStyleId` | UUID FK | **null = sin estilo elegido** (los prompts no incorporan fragmento de estilo) | FK a VisualStyle, ON DELETE SET NULL; renombrado desde `visualStyle` del enunciado para hacer explícita la clave foránea |
| `videoProvider` | TEXT | **null = no elegido todavía**; al llamar a generate-video sin valor → 409 `PROVIDER_NOT_CONFIGURED` | nombre del proveedor registrado en `providers.yaml` |
| `ttsProvider` | TEXT | igual semántica que `videoProvider`; valor por defecto asignado en creación: `"voicestudio"` (default del config `providers.default_tts`) | nombre registrado |
| `outputFormat` | enum | no nulo; default `mp4` | único valor v1: `mp4` (enum abierto a extensión) |
| `outputResolution` | enum | no nulo; default `720p` | `720p` \| `1080p` |
| `voiceId` | TEXT | **null = usa la voz por defecto del proveedor TTS** (cadena de herencia: escena → proyecto → default del proveedor; cadena documentada, no silenciosa: la UI la muestra) | id de voz del proveedor activo |
| `musicAssetKey` | TEXT | **null = sin música** | storage key válida asignada por `POST /projects/{id}/music` |
| `musicVolume` | REAL | no nulo; default `assembly.music_default_volume` (0.25) | rango (0, 1] validado en API |
| `musicOriginalName` | TEXT | **null = sin música o nombre no conservado** | metadato de la subida (nunca ruta — §3.5) |
| `musicDurationSeconds` | REAL | **null = sin música** | duración detectada con ffprobe al subir |
| `status` | enum `ProjectStatus` | no nulo; default `draft` | ver estados abajo |
| `createdAt` / `updatedAt` | datetime | no nulos | orden de paginación por defecto |

`ProjectStatus`: `draft` (creado, sin storyboard) → `storyboard_ready` (escenas generadas) → `in_production` (primer asset generado) → `assembling` (job de ensamblaje en curso) → `assembled`; `failed` es terminal-reintentable (ver F3 §3.4). Las transiciones las ejecutan los use cases; la BD no las impone (los estados son flujo de aplicación, no invariantes estructurales).

#### Scene

| Campo | Tipo | Nulidad / semántica | Restricciones |
|---|---|---|---|
| `id` | UUID | no nulo | PK |
| `projectId` | UUID FK | no nulo | FK Project ON DELETE CASCADE |
| `orderIndex` | INTEGER | no nulo | renombrado desde `order` del enunciado (`ORDER` es palabra reservada SQL); único dentro del proyecto (índice único compuesto); ≥ 0; contiguo (0..n-1), garantizado por el servicio de reorden |
| `originalText` | TEXT | no nulo | fragmento de `originalStory` asignado por el storyboard |
| `improvedText` | TEXT | **null = storyboard sin mejorar o pendiente de edición** | longitud ≤ `story.max_original_story_length` |
| `promptEn` | TEXT | **null = prompt aún no generado/editado** | longitud ≤ `scene.prompt_max_length` (2000) |
| `durationSeconds` | INTEGER | no nulo; default `scene.default_duration_seconds` (6) | rango [4, 15] **validado en API a partir de `scene.min/max_duration_seconds`** — deliberadamente NO es CHECK SQL (ver §2.4) |
| `narrationSource` | enum | no nulo; default `improved` | `improved` \| `original` \| `custom` |
| `narrationText` | TEXT | **null = se deriva de `narrationSource`**; solo se usa si `narrationSource=custom` | longitud ≤ `scene.prompt_max_length` |
| `voiceId` | TEXT | **null = hereda la voz del proyecto** (cadena: escena → proyecto → default del proveedor; la UI muestra la resolución efectiva) | id de voz del proveedor TTS |
| `imageBasePath` | TEXT | **null = imagen base no generada/subida** | storage key (nunca ruta absoluta) |
| `videoClipPath` | TEXT | **null = clip no generado** | storage key |
| `audioPath` | TEXT | **null = narración no generada** | storage key |
| `audioDurationSeconds` | REAL | **null = narración no generada aún** | duración real del audio generado (la usa el ensamblaje para planificar la mezcla) |
| `status` | enum `SceneStatus` | no nulo; default `draft` | ver estados abajo |
| `lastError` | TEXT (JSON problem) | **null = sin error registrado**; contenido = subconjunto RFC 7807 (code, title, detail, retryable) | se conserva hasta el próximo éxito del mismo paso |

`SceneStatus`: `draft` (creada, sin operación) → `image_pending` / `video_pending` / `audio_pending` (operación en curso; video es async) → `image_ready` / `video_ready` / `audio_ready` (último paso solicitado completado, asset path no nulo) → `failed` (última operación falló; conserva assets exitosos previos). Semántica declarada: `status` refleja el **último paso iniciado**, mientras que la **disponibilidad real de cada asset** se deriva de la no-nulidad de su path (`imageBasePath != null` ⇒ imagen disponible). La UI usa ambas cosas (chips de asset + estado de operación). Alternativa descartada: subestados por asset (`imageStatus`, `videoStatus`, `audioStatus`) — triplica el campo de estado sin beneficio para single-user (se anota como extensión v2 si aparecen operaciones paralelas por escena).

#### SceneReference (asociación escena↔referencia; añade estructura al requisito de asignación)

| Campo | Tipo | Nulidad | Restricciones |
|---|---|---|---|
| `id` | UUID | no nulo | PK |
| `sceneId` | UUID FK | no nulo | FK Scene ON DELETE CASCADE |
| `referenceId` | UUID FK | no nulo | FK Reference ON DELETE CASCADE |
| `kind` | enum | no nulo | `subject` \| `environment` |

Índice único (`sceneId`, `referenceId`). Límites de conteo por escena (`scene_reference.max_subjects_per_scene` = 2, `max_environments_per_scene` = 2) **validados en el use case**, no CHECK SQL (§2.4). Justificación de la tabla vs lista JSONB en Scene: la asignación es relacional (integridad referencial ON DELETE, reuso de referencias, y conteo consultable) — el patrón de atributos dinámicos de F4 NO aplica a relaciones entre entidades.

#### Reference

| Campo | Tipo | Nulidad / semántica | Restricciones |
|---|---|---|---|
| `id` | UUID | no nulo | PK |
| `projectId` | UUID FK | **null ⇔ `libraryScope = "global"`** (CHECK estructural, ver §2.4) | FK Project ON DELETE CASCADE |
| `type` | enum | no nulo | `character` \| `location` |
| `name` | TEXT | no nulo | 1..`reference.max_name_length` (200) caracteres |
| `description` | TEXT | **null = sin descripción** (no participa en prompt) | ≤ `reference.max_description_length` (2000) caracteres |
| `attributes` | JSONB (TEXT-JSON en SQLite) | no nulo; default `{}` (objeto vacío ≠ null: null está prohibido aquí porque «sin atributos» se representa con `{}` — decisión explícita documentada) | validado por `ReferenceValidator` (F4) |
| `referenceImages` | JSONB | no nulo; default `[]` | lista de `ReferenceImageEntry` (abajo); ≤ `reference.max_images_per_reference` (6) por el validador |
| `libraryScope` | enum | no nulo | `global` \| `project` |
| `level` | enum | no nulo; default `basic` | `basic` \| `advanced` \| `cinematic` (ver política de uso en §2.6) |
| `attributesSchemaVersion` | TEXT | no nulo; default `"v1"` | versión del JSON Schema contra el que se validó en escritura |

`ReferenceImageEntry` (estructura interna del array JSONB; validada en el use case):

```json
{ "id": "uuid-v4", "storageKey": "outputs/.../img.png", "isPrimary": false,
  "source": "upload" | "ai", "createdAt": "2025-01-01T00:00:00Z" }
```

Invariantes del array (servicio): ids únicos dentro del array; exactamente una entrada con `isPrimary=true` si el array no está vacío (si no, ninguna); `storageKey` existente en StorageService.

#### VisualStyle

| Campo | Tipo | Nulidad | Restricciones |
|---|---|---|---|
| `id` | UUID | no nulo | PK |
| `name` | TEXT | no nulo | único |
| `description` | TEXT | **null = sin descripción** | ≤ `visual_style.max_description_length` (500) caracteres |
| `promptFragmentEn` | TEXT | no nulo | ≤ `visual_style.max_prompt_fragment_length` (1000) caracteres; inglés (A-03) |
| `isCustom` | BOOLEAN | no nulo | `false` = sembrado por migración idempotente desde `styles.yaml`; `true` = creado por usuario |
| `createdAt` | datetime | no nulo | — |

Regla de negocio: borrar un estilo con `isCustom=false` → 409 `DELETION_FORBIDDEN` (los seeds son parte del producto). Se permite PATCH del `promptFragmentEn` de seeds (el usuario puede ajustar), prohibido cambiar `isCustom`.

#### ProviderConfig

| Campo | Tipo | Nulidad / semántica | Restricciones |
|---|---|---|---|
| `id` | UUID | no nulo | PK |
| `providerType` | enum | no nulo | `video` \| `tts` \| `llm` \| `image` \| `audio_qa` (extensión justificada en ADR-010) |
| `providerName` | TEXT | no nulo | único compuesto con `providerType`; debe existir en `providers.yaml` (validación contra registro — error de configuración si no) |
| `apiKeyEncrypted` | TEXT | **null = key no configurada**; usar el proveedor sin key → 409 `PROVIDER_NOT_CONFIGURED` (fail fast, nunca null silencioso) | ciphertext Fernet (ADR-012) |
| `baseUrl` | TEXT | **null = usa el `base_url` por defecto del registro `providers.yaml`** (herencia documentada y mostrada en UI) | URL absoluta |
| `defaultParams` | JSONB | no nulo; default `{}` | pases de parámetros por proveedor; claves validadas contra `providers.yaml` (unknown key → 422, no se descartan en silencio) |
| `isActive` | BOOLEAN | no nulo; default `true` | un proveedor activo por tipo puede marcarse; el proyecto referencia por nombre |
| `lastCheck` | JSONB | **null = nunca probado** | resultado del `POST /{id}/test` (ok, latencyMs, error code) |

#### AssemblyJob

| Campo | Tipo | Nulidad | Restricciones |
|---|---|---|---|
| `id` | UUID | no nulo | PK |
| `projectId` | UUID FK | no nulo | FK ON DELETE CASCADE |
| `jobType` | enum | no nulo | `assembly` \| `audio_qa` (Earshot reutiliza esta entidad; extensión documentada en ADR-013/014) |
| `status` | enum | no nulo; default `pending` | `pending` \| `running` \| `completed` \| `failed` |
| `outputPath` | TEXT | **null = sin salida (pendiente, failed, o audio_qa sin archivo)** | storage key |
| `report` | JSONB | **null = sin reporte** (audio_qa escribe métricas/observaciones) | forma del reporte definida al integrar Earshot (supuesto A-06) |
| `errorMessage` | TEXT (JSON problem) | **null = sin error** | snapshot RFC 7807 (code/title/detail/retryable) |
| `params` | JSONB | no nulo | snapshot inmutable de parámetros de ejecución (includeAudio, musicAssetKey, musicVolume, resolución, fps…) para reproducibilidad |
| `startedAt` / `finishedAt` | datetime | **null = no ocurrió** | — |
| `createdAt` | datetime | no nulo | orden de paginación |

### 2.4 Invariantes, validaciones y dónde se aplican

Tabla canónica (INV). Principio declarado: **los invariantes estructurales van a la BD (CHECKs); los límites de negocio NO (viven en config y se validan en API/servicio), para que cambiar un límite no requiera migración de esquema** (cero hardcoding, LISTÓN punto 6). Cada fila declara capa de aplicación.

| INV | Invariante | Capa |
|---|---|---|
| INV-01 | `Scene.projectId` existe; borrar proyecto borra sus escenas | BD (FK CASCADE) |
| INV-02 | `Scene.orderIndex` único por proyecto y ≥ 0; contigüidad 0..n-1 tras cada operación de orden | BD (índice único compuesto) + servicio (contigüidad) |
| INV-03 | `durationSeconds` ∈ [min, max] de config | API (Pydantic, lee config) — no CHECK SQL (deliberado, ver principio) |
| INV-04 | `Reference`: `libraryScope="global"` ⇔ `projectId IS NULL` | BD (CHECK compuesto; invariante estructural, no límite) |
| INV-05 | `referenceImages`: ≤ max de config; ids únicos; 1 primaria si no vacío | Servicio/validador (config) |
| INV-06 | `attributes`: valida contra JSON Schema v1 + límites de config | `ReferenceValidator` (F4) |
| INV-07 | `ProviderConfig (providerType, providerName)` único; `providerName` ∈ registro `providers.yaml` | BD (único compuesto) + validación contra registro |
| INV-08 | `Scene.status` solo transiciones válidas (§2.3) | Use case (máquina de estados en dominio) |
| INV-09 | Ensamblaje solo si todas las escenas tienen video y (audio o `assembly.require_audio=false`) | Use case (409 si no) |
| INV-10 | `SceneReference` única por (sceneId, referenceId); conteos por kind ≤ config | BD (único) + API (conteos) |
| INV-11 | `VisualStyle.name` único; `isCustom=false` no borrable | BD + use case |
| INV-12 | `AssemblyJob` con `jobType=assembly` solo `completed` si `outputPath` no nulo | Use case |
| INV-13 | `Scene.promptEn` solo con caracteres ASCII imprimibles + puntuación común (los prompts son en inglés; el storyboard lo garantiza; PATCH lo valida) | API (Pydantic) |
| INV-14 | `ProviderConfig.apiKeyEncrypted` nunca se devuelve en respuestas (solo `apiKeyMasked`) | Presentación |

Nota SQLite: las FKs y CHECKs solo se aplican si el engine activa `PRAGMA foreign_keys=ON` por conexión (event listener — §2.1, ADR-001); INV-01/INV-04 tienen test de contrato previsto en §6.6.

### 2.5 Atributos dinámicos: JSONB vs alternativas

Decisión (ADR-003): `attributes` y `referenceImages` como JSONB (`sa.JSON` con variante `JSONB` para PostgreSQL). En SQLite se serializan como TEXT con validación de JSON + JSON Schema en la capa de aplicación en cada escritura.

| Criterio | JSONB | EAV | Columnas fijas |
|---|---|---|---|
| Añadir atributo (hairColor) | sin cambio de esquema ni de núcleo | sin cambio de esquema (filas nuevas) | requiere ALTER TABLE |
| Consultar/filtrar por atributo | soportado (SQLite: LIKE/`json_extract`; PG: operadores nativos) | soportado (JOIN) | nativo |
| Complejidad de código | baja (dict + schema) | alta (N filas, N+1 en lectura, reconstruction de objeto) | baja |
| Integridad | JSON Schema en escritura | tipos por fila, dispersa | CHECKs por columna |
| Coste real en AirShot | lectura entera por referencia (referencias son decenas-cientos) | sobre-coste estructural sin requisito de filtro por atributo (v1 no filtra por atributo: ver §3.2) | viola regla del enunciado |

Alternativa descartada EAV: no existe requisito de consultar por atributo (los listados filtran por nombre/tipo/level/scope, todos columnas). Alternativa descartada columnas fijas: el enunciado exige añadir atributos sin migración. Coste aceptado de JSONB: validación imperativa de profundidad y tamaño (F4 §4.2), sin índices sobre atributos en v1.

### 2.6 Factories (solo las que aportan valor; el resto descartado)

- `ReferenceFactory` (dominio): construye `Reference` garantizando invariantes INV-04/05/06 en un solo lugar: normaliza `libraryScope`↔`projectId`, sella `attributesSchemaVersion`, fija la primera imagen como primaria, aplica defaults de `level`. Problema: dispersión de invariantes en controllers. Coste: una clase más. Alternativa descartada: constructores directos dispersos (invariantes repartidas y divergentes).
- `VideoProviderFactory`, `TTSProviderFactory`, `LLMProviderFactory`, `ImageProviderFactory`, `AudioQAProviderFactory` (infraestructura, uno por tipo de puerto): instancian adaptadores desde `providers.yaml` (registro declarativo) + `ProviderConfig` (secretos/baseUrl/params). Problema: intercambiabilidad LISTÓN. Coste: registro + resolución de nombres. Alternativa descartada: if/else por proveedor en use cases (acopla núcleo; el ejemplo del ProviderX en §4.8 fallaría).
- **Descartados**: Builder (ningún objeto requiere construcción paso a paso paramétrica — la creación es de una vez con validación), Abstract Factory adicional (no hay familias de objetos relacionadas), Prototype (no hay costo de creación relevante).

**Política de uso por `level`** (hogar único de la regla; la citan §2.3 y R-03; la ejecutan `PromptComposer` y la selección de imágenes en el use case de video):

| `level` | Qué entra al `promptEn` | Imágenes de referencia usadas |
|---|---|---|
| `basic` | `name` + `description` | hasta `reference.level_image_limits.basic` (1) — la primaria |
| `advanced` | lo anterior + todos los `attributes` | hasta `reference.level_image_limits.advanced` (2) |
| `cinematic` | lo anterior + fragmento de cohesión con el `VisualStyle` del proyecto | hasta el `reference_image_limit` del proveedor (`level_image_limits.cinematic = null` = sin tope de nivel) |

El tope efectivo por generación es `min(level_image_limits[level] (si no es null), reference_image_limit del proveedor)`; el total de imágenes por referencia nunca excede `reference.max_images_per_reference`.

### 2.7 Índices y estrategia de migraciones

Índices (cada uno sirve a una consulta concreta del catálogo F3; sin índices decorativos):

| Índice | Columnas (orden) | Sirve a |
|---|---|---|
| `ix_projects_created_id` | `created_at DESC, id DESC` | `GET /projects` (cursor createdAt+id) |
| `ix_scenes_project_created` | `project_id, created_at DESC, id DESC` | `GET /projects/{id}/scenes` sortBy=createdAt |
| `uq_scenes_project_order` | `project_id, order_index` (único) | `GET /scenes?sortBy=order` (cursor orderIndex) + INV-02 |
| `ix_scenes_project_status` | `project_id, status, created_at DESC` | filtro `?status=` |
| `ix_references_scope_created` | `library_scope, project_id, created_at DESC, id DESC` | `GET /references?scope=&projectId=` |
| `ix_references_type_level` | `type, level` | filtros de biblioteca |
| `ix_styles_created_id` | `created_at DESC, id DESC` | `GET /visual-styles` |
| `uq_providerconfigs_type_name` | `provider_type, provider_name` (único) | INV-07 |
| `ix_jobs_project_created` | `project_id, created_at DESC, id DESC` | `GET /projects/{id}/assemblies` |
| `ix_scene_references_scene` | `scene_id, reference_id` (único) | asignaciones por escena |

Migraciones (Alembic, ADR-001):

1. Baseline `0001_initial` con todas las tablas e índices.
2. Seed idempotente de `visual_styles` desde `styles.yaml` (MERGE por `name`; solo inserta los que faltan) — la semilla es dato versionado, no código.
3. Política: cambios de esquema = nueva revisión Alembic generada contra los modelos; los límites de negocio cambian en `config.yaml` **sin** migración (punto §2.4); la ruta SQLite→PostgreSQL es cambio de driver + revisión Alembic que no toca dominio (repos inalterados).
4. Los datos JSONB no se migran al cambiar el JSON Schema de atributos salvo renombres (política de versionado en §4.5).

---

## FASE 3 — Contratos API

### 3.1 Convenciones generales (transversales)

Base de rutas: `/api/v1` (prefijo versionado; constantes técnicas justificadas). JSON UTF-8. Errores siempre RFC 7807 (Problem Details) con extensiones propias: `code`, `traceId`, `retryable`, y contexto opcional (`provider`, `sceneId`, `field`, `hints[]` — sugerencias accionables para la UI).

#### 3.1.1 Taxonomía canónica de tolerancia a fallos (LISTÓN punto 5; referencia única para todo el documento)

| Tipo | Definición | Tratamiento API | HTTP | `code` | ¿Reintentar? |
|---|---|---|---|---|---|
| **Campo opcional ausente** | La clave no viene en el payload | PATCH/POST aplican el valor previo/default declarado del campo; el comportamiento se documenta por endpoint (no es error) | — (200/201/202) | — | — |
| **Valor nulo** | La clave viene con `null` y el campo es nullable | Se asigna null con la semántica documentada en §2.3 (p. ej. `improvedStory: null` = «sin storyboard») | 200 | — | — |
| **Valor nulo en campo no nullable** | La clave viene con `null` y el campo no lo permite | Rechazo explícito (nunca coercion a vacío/default) | 422 | `VALIDATION_ERROR` | no |
| **Dato inválido** | Tipo/formato/rango incorrecto (duración fuera de [min,max], UUID malformado, `limit=0`, enum desconocido) | Rechazo con detalle de campo; los rangos se leen de config, no hardcodeados | 422 | `VALIDATION_ERROR` / `UNEXPECTED_FIELD` (campo desconocido: se rechaza, no se descarta en silencio) | no |
| **Error temporal** | Timeout/remoto 5xx/429/conexión del proveedor | Reintentos con backoff exponencial (`max_retries`, `backoff_base_seconds` por proveedor); agotados → problema con `retryable=true`; asset/estado marcado fallido-reintentable | 504 (timeout) / 503 (unavailable/rate) | `PROVIDER_TIMEOUT` / `PROVIDER_UNAVAILABLE` / `PROVIDER_RATE_LIMIT` | sí (UI ofrece botón reintentar) |
| **Error de autorización (proveedor)** | 401/403 del proveedor (API key inválida) | Sin reintentos (no es transitorio); se marca `ProviderConfig.lastCheck`; mensaje apunta a Configuración; **nunca fallback a otro proveedor en silencio** | 502 | `PROVIDER_AUTH` | no (corregir key) |
| **Error de configuración** | Proveedor elegido sin `ProviderConfig`, nombre no registrado, o key ausente | Fail fast ANTES de llamar al proveedor | 409 | `PROVIDER_NOT_CONFIGURED` | no (configurar) |
| **Fallo crítico** | Excepción no controlada (bug), BD corrompida | 500, log con traceId, job/estado `failed` con snapshot del problema; sin ocultamiento | 500 | `INTERNAL_ERROR` | no |
| No encontrado | Recurso inexistente | — | 404 | `NOT_FOUND` | no |
| Estado inválido | Operación contra estado incorrecto (ensamblar con escenas incompletas, borrar seed, regenerate sin storyboard) | — | 409 | `ASSEMBLY_INCOMPLETE_SCENES` / `DELETION_FORBIDDEN` / `STATE_CONFLICT` | tras corregir estado |
| Payload excesivo | Body > `app.max_body_bytes` | — | 413 | `PAYLOAD_TOO_LARGE` | no |
| Medio no soportado | Upload con mimetype fuera de whitelist | — | 415 | `UNSUPPORTED_MEDIA` | no |
| Salida inválida del LLM | JSON estructuralmente inválido agotados los reintentos (UC-02) | sin reintentos adicionales; el usuario ajusta y regenera | 502 | `LLM_INVALID_OUTPUT` | no |
| Límite de imágenes de referencia | superado `reference.max_images_per_reference` | — | 422 | `REFERENCE_IMAGE_LIMIT` | no |
| Validación de atributos (F4 §4.2) | familia `ATTRIBUTE_*` y `SENSITIVE_KEY`, un `code` por control C-01..C-13 | — | 422 | ver §4.2 | no |

Reglas adicionales de honestidad: ningún catch vacío; ningún `except: pass`; los errores de proveedor se registran con su `code` original en `detail` (preservando causa); los valores por defecto solo se aplican en el caso «ausente» y siempre están documentados en §2.3.

#### 3.1.2 Autenticación (hueco preparado)

Todos los routers dependen de `Depends(get_current_user)`. Hoy: devuelve `LocalUser(id=config.app.local_user_id)` — usuario local único (supuesto A-07). Mañana: la misma dependency resuelve JWT/OAuth; ningún controller cambia. No hay autorización por recurso en v1 (single-user); la UI no muestra login.

#### 3.1.3 Paginación por cursor (LISTÓN punto «Lista Infinita»)

- **Todos** los listados sin excepción (proyectos, escenas por proyecto, referencias, estilos, provider-configs, assemblies por proyecto, voces TTS) aceptan `?limit=&cursor=`.
- `limit`: entero ≥ 1; default `pagination.default_page_size` (25); máximo `pagination.max_page_size` (100); `limit > max` → 422 `VALIDATION_ERROR` con hint del máximo (no se recorta en silencio).
- `cursor`: opaco (base64url de la clave de ordenación compuesta). Envolvente de respuesta:

```json
{ "items": [ /* ≤ limit; default 25, máx pagination.max_page_size */ ], "nextCursor": "b64…|null", "limit": 25 }
```

- `nextCursor == null` ⇒ no hay más páginas. No se devuelve `total` (COUNT(*) es O(n) en toda la tabla y rompe la escalabilidad; alternativa descartada y documentada — la UI usa «cargar más» infinito).
- Claves de ordenación por endpoint (siempre deterministas: clave de negocio + desempate por `id`):
  - Colecciones por `createdAt`: cursor = `(createdAt, id)`; predicado SQL expandido portable: `(created_at < :c) OR (created_at = :c AND id < :i)` con `ORDER BY created_at DESC, id DESC` (o ASC). El desempate por `id` evita duplicados/pérdidas con timestamps empatados.
  - Escenas dentro de proyecto por defecto `sortBy=order`: cursor = `orderIndex` (único dentro del proyecto gracias a INV-02; sin desempate necesario); `sortBy=createdAt` también permitido (cursor `(createdAt,id)`).
- `sortBy` y `order` son whitelists por endpoint (`order: asc|desc`); valores fuera de whitelist → 422 `VALIDATION_ERROR`. Sorts arbitrarios (por `title`, etc.) quedan fuera del contrato v1 porque rompen la estabilidad del cursor; se declara como extensión futura con su propia clave compuesta.
- Filtros combinables con cursor (`?status=&type=&level=&scope=&q=`): los predicados se encadenan al de cursor. Los filtros de rango (`status`, `type`, `level`, `scope`, `projectId`) tienen índice dedicado (§2.7); `q` (prefijo `name LIKE q%`), `origin`, `jobType` y `status` en proyectos son **predicados residuales** aceptados deliberadamente a escala local (página recuperada por el índice de orden + filtrado en memoria de la página) — declaración explícita, no omisión.
- Cursor malformado, ilegible o inconsistente con el `sortBy` de la request → 422 `VALIDATION_ERROR` (dato inválido; nunca se ignora en silencio).
- Complejidad real declarada: cada página es O(limit) filas vía seek de índice (sin OFFSET); memoria O(limit) en servidor; el estado de paginación vive en el cliente (cursor), no en sesión de servidor. Límites prácticos declarados: (a) tamaño de página ≤ 100 y payloads de escena con textos largos → hasta pocos MB por página (por eso `max_page_size` es configurable y conservador); (b) SQLite maneja millones de filas con estos índices, pero el cuello real es el payload HTTP, no la BD; (c) inserciones concurrentes durante la paginación no producen duplicados (cursor por clave estable).

#### 3.1.4 Concurrencia y rate limiting por proveedor

- Cada proveedor del registro `providers.yaml` define `max_concurrent` (semáforo asyncio por proveedor, p. ej. Veo 2, Kling 1). Cola de espera sin límite en v1 (single-user; se declara límite práctico: la UI no permite lanzar más de N escenas en lote — N configurable vía `app.batch_max_operations`).
- HTTP 429 propio (rate limit de AirShot) queda **reservado y no implementado** en v1 (no existe multiusuario); se declara explícitamente para no fingir capacidad.
- Timeouts y reintentos por operación son los del Anexo B por proveedor (`timeout_seconds`, `max_retries`, `backoff_base_seconds`).
- **Regla de resolución de proveedor** para una operación: `providerOverride` del request > campo del proyecto (`videoProvider` / `ttsProvider`) > default de `config.yaml` (`providers.default_tts`, `providers.default_llm`, `providers.default_image`). El proveedor resuelto sin `ProviderConfig` activo con key → 409 `PROVIDER_NOT_CONFIGURED` (fail fast).

### 3.2 Catálogo completo de endpoints

Leyenda: **P** = paginado (`limit`/`cursor`). Todos los cuerpos JSON salvo los marcados `multipart`. Todos requieren `get_current_user` (stub). Los errores listados son los específicos además de la fila genérica de §3.1.1.

#### Proyectos

| Endpoint | Propósito | Request | Response | Errores específicos |
|---|---|---|---|---|
| `POST /api/v1/projects` | Crear proyecto con historia | `{title, originalStory, settings?{videoProvider?, ttsProvider?, visualStyleId?, outputResolution?, voiceId?}}` | 201 `ProjectResponse` | 422 (título/historia fuera de límites `story.*`) |
| `GET /api/v1/projects` **P** | Listar proyectos | `?limit&cursor&status&q&sortBy=createdAt&order=desc` | 200 `CursorPage<ProjectSummary>` | 422 `limit=0`, `sortBy` fuera de whitelist |
| `GET /api/v1/projects/{id}` | Detalle | — | 200 `ProjectResponse` | 404 |
| `PATCH /api/v1/projects/{id}` | Editar título/historia/ajustes (semántica ausente≠nulo de §3.1.1) | campos parciales | 200 `ProjectResponse` | 404, 422 |
| `DELETE /api/v1/projects/{id}` | Borrar proyecto + assets de storage | — | 204 | 404 |
| `POST /api/v1/projects/{id}/storyboard` | Mejorar historia + dividir en escenas + prompts en inglés (síncrono, ADR-014) | `{regenerate?: bool=false, targetDurationSeconds?: int}` | 200 `{improvedStory, scenes: SceneResponse[]}` (reemplaza escenas existentes si `regenerate=true`; si no, 409 `STATE_CONFLICT` si ya había escenas) | 404; 409 `STATE_CONFLICT`; 502 `LLM_INVALID_OUTPUT`; 504/503 error temporal LLM; 422 si `targetDurationSeconds` fuera de [4,15] de config |
| `POST /api/v1/projects/{id}/music` | Subir música opcional | `multipart` (audio; límites `upload.music.*`) | 200 `{musicAssetKey, durationSeconds}` | 404, 413, 415 |
| `DELETE /api/v1/projects/{id}/music` | Quitar música (no borra el job histórico) | — | 204 | 404, 409 `STATE_CONFLICT` si hay ensamblaje en curso |
| `POST /api/v1/projects/{id}/assemble` | Ensamblar video final (async) | `{includeAudio?: bool, musicVolume?: float}` | 202 `AssemblyJobResponse` (sondeo) | 404; 409 `ASSEMBLY_INCOMPLETE_SCENES` (INV-09); 409 si ya hay job `running` |
| `GET /api/v1/projects/{id}/assemblies` **P** | Historial de jobs del proyecto | `?limit&cursor&jobType&sortBy=createdAt` (único valor admitido) | 200 `CursorPage<AssemblyJobResponse>` | 404, 422 |
| `POST /api/v1/projects/{id}/audio-qa` | Ejecutar Earshot (opt-in) | `{features: ["naturalness"\|"sync"\|"loudness"\|"artifacts"], generateSfx?: bool=false}` | 202 `AssemblyJobResponse` (`jobType=audio_qa`) | 404; 409 si `audio_qa.earshot.enabled=false` en config (módulo desactivado — se exige activarlo en config, no por API); 503 si el módulo no está disponible |
| `GET /api/v1/projects/{id}/scenes` **P** | Escenas del proyecto | `?limit&cursor&status&sortBy=order\|createdAt&order` | 200 `CursorPage<SceneResponse>` | 404, 422 |
| `PUT /api/v1/projects/{id}/scenes/order` | Reordenar (lista completa) | `{sceneIds: [uuid…]}` (debe ser la totalidad; set exacto) | 200 `{scenes: SceneResponse[]}` reordenadas | 404; 422 si el set no coincide exactamente con las existentes (faltan/sobran/duplicadas) |

#### Escenas

| Endpoint | Propósito | Request | Response | Errores específicos |
|---|---|---|---|---|
| `GET /api/v1/scenes/{id}` | Detalle (incluye assets con URLs `/media/...` y `lastError`) | — | 200 `SceneResponse` | 404 |
| `PATCH /api/v1/scenes/{id}` | Editar promptEn/duración/textos/narración | campos parciales (`durationSeconds`, `promptEn`, `improvedText`, `narrationSource`, `narrationText`, `voiceId`) | 200 `SceneResponse` | 404; 422 `VALIDATION_ERROR` (rango de config; `narrationText` con `narrationSource≠custom` → 422: se rechaza en vez de ignorarse) |
| `DELETE /api/v1/scenes/{id}` | Borrar escena + assets + recompactar orderIndex | — | 204 | 404 |
| `PUT /api/v1/scenes/{id}/references` | Sustituir asignaciones de referencias | `{items: [{referenceId, kind: subject\|environment}]}` | 200 `SceneResponse` | 404; 422 si excede `scene_reference.max_*` o referencias inexistentes/ámbito no visible |
| `POST /api/v1/scenes/{id}/generate-image` | Generar imagen base con IA (síncrono, ADR-014) | `{providerOverride?, styleId?}` | 200 `SceneResponse` (`imageBasePath` nuevo) | 404; 409 `PROVIDER_NOT_CONFIGURED`; 502 `PROVIDER_AUTH`; 504/503 temporal |
| `POST /api/v1/scenes/{id}/image` | Subir imagen base | `multipart` (imagen; `upload.image.*`) | 200 `SceneResponse` | 404, 413, 415 |
| `DELETE /api/v1/scenes/{id}/image` `/video` `/audio` | Descartar asset | — | 204 | 404; 409 `STATE_CONFLICT` si hay operación `*_pending` en curso |
| `POST /api/v1/scenes/{id}/generate-video` | Generar clip con proveedor de video (async, ADR-014) | `{providerOverride?, durationSeconds?}` | 202 `SceneResponse` (`status=video_pending`) → sondeo `GET /scenes/{id}` | 404; 409 `PROVIDER_NOT_CONFIGURED`; 409 `STATE_CONFLICT` si `imageBasePath` es null (image-to-video requiere imagen base) o ya hay `video_pending`; 422 duración de config; el fallo del proveedor se materializa al sondear en `lastError` (snapshot RFC 7807; el sondeo responde 200) |
| `POST /api/v1/scenes/{id}/generate-audio` | Narración TTS (síncrono) | `{providerOverride?, voiceId?}` | 200 `SceneResponse` (`audioPath`, `audioDurationSeconds`) | 404; 409 `PROVIDER_NOT_CONFIGURED`; 502 `PROVIDER_AUTH`; 503/504 temporal |

Semántica de sobrescritura de assets: `POST /scenes/{id}/image`, `POST /scenes/{id}/generate-image` y `POST /projects/{id}/music` **sustituyen** el asset previo (el huérfano se borra vía `StorageService`); si hay una operación `*_pending` en curso → 409 `STATE_CONFLICT`.

#### Referencias

| Endpoint | Propósito | Request | Response | Errores específicos |
|---|---|---|---|---|
| `POST /api/v1/references` | Crear referencia (biblioteca global o de proyecto) | `{type, name, description?, libraryScope, projectId?, level?, attributes?}` — `attributes` es el JSON genérico validado en F4 | 201 `ReferenceResponse` | 422 (F4: `ATTRIBUTE_LIMIT`, `SENSITIVE_KEY`, `ATTRIBUTE_DEPTH`, `ATTRIBUTE_NAME`, `ATTRIBUTE_VALUE`, `UNEXPECTED_FIELD`, `VALIDATION_ERROR`); 422 si `libraryScope=project` sin `projectId` o con ámbito inconsistente |
| `GET /api/v1/references` **P** | Listar referencias | `?scope=global\|project&projectId&type&level&q&limit&cursor&sortBy=createdAt&order` | 200 `CursorPage<ReferenceResponse>` | 422 |
| `GET /api/v1/references/{id}` | Detalle | — | 200 | 404 |
| `PATCH /api/v1/references/{id}` | Editar (semántica ausente≠nulo; `attributes` sustituye al completo si se envía) | campos parciales | 200 | 404, 422 (mismos códigos F4) |
| `DELETE /api/v1/references/{id}` | Borrar (ON DELETE CASCADE de asignaciones) | — | 204 | 404 |
| `POST /api/v1/references/{id}/images` | Subir imagen de referencia | `multipart` | 200 `ReferenceResponse` | 404, 413, 415, 422 `REFERENCE_IMAGE_LIMIT` |
| `POST /api/v1/references/{id}/generate-image` | Generar imagen de referencia con IA | `{styleId?}` | 200 `ReferenceResponse` | 404; 409 `PROVIDER_NOT_CONFIGURED`; 422 `REFERENCE_IMAGE_LIMIT`; 502/503/504 |
| `DELETE /api/v1/references/{id}/images/{imageId}` | Quitar imagen | — | 204 | 404 (imagen o referencia) |
| `PATCH /api/v1/references/{id}/images/{imageId}` | Marcar primaria | `{isPrimary: true}` | 200 | 404; 422 si `isPrimary:false` (se exige exactly-one) |

#### Estilos visuales

| Endpoint | Propósito | Request | Response | Errores específicos |
|---|---|---|---|---|
| `POST /api/v1/visual-styles` | Crear estilo custom | `{name, description?, promptFragmentEn}` | 201 | 422 (longitudes §2.3) |
| `GET /api/v1/visual-styles` **P** | Listar | `?origin=seeded\|custom&limit&cursor&sortBy=createdAt` (único valor admitido) | 200 `CursorPage<VisualStyleResponse>` | 422 |
| `PATCH /api/v1/visual-styles/{id}` | Editar fragmento/descripción | campos parciales | 200 | 404; 422 |
| `DELETE /api/v1/visual-styles/{id}` | Borrar custom | — | 204 | 404; 409 `DELETION_FORBIDDEN` (seed) |

#### Configuración de proveedores, voces, config runtime y salud

| Endpoint | Propósito | Request | Response | Errores específicos |
|---|---|---|---|---|
| `GET /api/v1/provider-configs` **P** | Listar configs (API key enmascarada INV-14) | `?providerType&limit&cursor&sortBy=createdAt` (único valor admitido) | 200 `CursorPage<ProviderConfigResponse>` (con `apiKeyMasked`, `lastCheck`) | 422 |
| `POST /api/v1/provider-configs` | Upsert explícito de config (semántica única: 201 si el par `(providerType, providerName)` no existía; 200 si actualizó el existente — INV-07 intacta) | `{providerType, providerName, apiKey?, baseUrl?, defaultParams?}` | 201 / 200 | 422 (nombre no registrado → `VALIDATION_ERROR` con whitelist de nombres; claves de `defaultParams` desconocidas) |
| `PATCH /api/v1/provider-configs/{id}` | Editar | campos parciales (`apiKey` write-only) | 200 | 404, 422 |
| `DELETE /api/v1/provider-configs/{id}` | Borrar config | — | 204 | 404 |
| `POST /api/v1/provider-configs/{id}/test` | Probar credenciales/conectividad | — | 200 `{ok, latencyMs, error?: {code, detail}}` | 404; 409 si proveedor requiere key y no la tiene (fail fast local) |
| `GET /api/v1/tts/voices` **P** | Voces del proveedor TTS activo | `?provider&limit&cursor` | 200 `CursorPage<VoiceInfo>` | 409 `PROVIDER_NOT_CONFIGURED`; 503/504 temporal |
| `GET /api/v1/assemblies/{jobId}` | Sondeo de job individual (ensamblaje o audio-qa; usado por E-5 y §5.2) | — | 200 `AssemblyJobResponse` | 404 `NOT_FOUND` |
| `GET /api/v1/config` | Límites y defaults efectivos (solo lectura) para que el frontend no duplique constantes | — | 200 `{app{batch_max_operations}, pagination, story, scene, scene_reference, reference, visual_style, upload, media, assembly, audio_qa{enabled}, providers:{registrados por tipo}}` — lista cerrada = los grupos de **límites de negocio** del Anexo A (se excluyen `storage` y `security`, que son infraestructura y seguridad, no límites de formulario) | — |
| `GET /api/v1/health` | Liveness | — | 200 `{status:"ok"}` | 500 si la app no arranca |
| `GET /api/v1/health?deep=true` | Comprobaciones: BD, storage escribible, ffmpeg/ffprobe versión, VoiceStudio reachability, configs con key inválida | — | 200 `{checks:[{name, ok, detail?}]}` | — (cada check declara su estado; 200 en tanto la app responda) |

**Recuento de listados y su paginación** (prueba del LISTÓN): `GET /projects` ✔, `GET /projects/{id}/scenes` ✔, `GET /projects/{id}/assemblies` ✔, `GET /references` ✔, `GET /visual-styles` ✔, `GET /provider-configs` ✔, `GET /tts/voices` ✔. No existe ningún endpoint de listado sin `limit`/`cursor` en el contrato v1.

**Paginación de voces**: `VoiceInfo = {id, name, language?, description?}`; el adaptador materializa el catálogo del proveedor (decenas de entradas), lo ordena de forma estable por `id` y pagina en memoria con cursor = base64url(`id`) — determinista y sin duplicados; límite real declarado (un catálogo mayor que una página se itera con el cursor).

#### Media

- Montaje estático `/media/*` sobre `data/uploads` y `data/outputs` con resolución de claves por `StorageService` (contención de rutas: la clave se normaliza y se comprueba que queda dentro del root; los keys son generados por el servidor — ver §3.5).
- Cabeceras: `Cache-Control: private, max-age=<media.cache_max_age_seconds>` (contenido local privado; clave del Anexo A).

### 3.3 Ejemplos completos de contrato (JSON)

#### E-1 — Crear proyecto

`POST /api/v1/projects` → `201 Created`

```json
{
  "title": "El faro de Alejandría",
  "originalStory": "…historia completa en español…",
  "settings": { "videoProvider": "veo", "ttsProvider": "voicestudio", "outputResolution": "1080p" }
}
```

Respuesta (extracto):

```json
{
  "id": "0f9d6c2e-…", "title": "El faro de Alejandría", "status": "draft",
  "originalStory": "…", "improvedStory": null,
  "videoProvider": "veo", "ttsProvider": "voicestudio", "voiceId": null,
  "visualStyleId": null, "outputFormat": "mp4", "outputResolution": "1080p",
  "musicAssetKey": null, "musicVolume": 0.25,
  "createdAt": "2025-06-01T12:00:00Z", "updatedAt": "2025-06-01T12:00:00Z"
}
```

(`improvedStory: null` con la semántica §2.3: aún sin storyboard.)

#### E-2 — Listar proyectos con cursor

`GET /api/v1/projects?limit=2&order=desc` →

```json
{
  "items": [
    { "id": "0f9d6c2e-…", "title": "El faro de Alejandría", "status": "storyboard_ready",
      "sceneCount": 18, "createdAt": "2025-06-01T12:00:00Z" },
    { "id": "7a4b…", "title": "Cuento de invierno", "status": "assembled",
      "sceneCount": 32, "createdAt": "2025-05-30T09:15:00Z" }
  ],
  "nextCursor": "eyJjIjoiMjAyNS0wNS0zMFQwOToxNTowMFoiLCJpZCI6IjdhNGIifQ",
  "limit": 2
}
```

`nextCursor` = base64url de `{"c":"<createdAt ISO>","id":"<uuid>"}`. La siguiente llamada: `GET /api/v1/projects?limit=2&cursor=<valor>`.

(`sceneCount`: COUNT por proyecto acotado por `scene.max_scenes_per_project` (200) vía índice único `(project_id, order_index)` — coste acotado por fila declarado; alternativa descartada: eliminar el dato del resumen.)

#### E-3 — PATCH de escena: ausente ≠ nulo ≠ inválido

`PATCH /api/v1/scenes/3c1f…` con:

```json
{ "durationSeconds": 8 }
```

→ 200: solo cambia la duración; `promptEn` ausente queda intacto (comportamiento documentado §3.1.1). Con:

```json
{ "promptEn": null }
```

→ 200: `promptEn` pasa a null («sin prompt», semántica §2.3). Con:

```json
{ "durationSeconds": 99 }
```

→ `422` con problema RFC 7807:

```json
{
  "type": "https://airshot.local/problems/validation-error",
  "title": "Datos inválidos",
  "status": 422,
  "detail": "durationSeconds debe estar entre 4 y 15",
  "instance": "/api/v1/scenes/3c1f…",
  "code": "VALIDATION_ERROR",
  "field": "durationSeconds",
  "retryable": false,
  "hints": ["El rango se lee de GET /api/v1/config (scene.min/max_duration_seconds)"],
  "traceId": "tr-9f2b…"
}
```

#### E-4 — Generar video (async) y sondeo con los tres fallos representativos

`POST /api/v1/scenes/3c1f…/generate-video` con `{}` → `202 Accepted`:

```json
{ "id": "3c1f…", "status": "video_pending", "videoClipPath": null, "lastError": null, "…" : "…" }
```

Sondeo `GET /api/v1/scenes/3c1f…` → `video_ready` con `videoClipPath: "outputs/projects/…/scenes/3c1f…/clip.mp4"` y URL `/media/outputs/…`.

Fallo temporal agotado (timeout de Veo tras reintentos):

```json
{
  "type": "https://airshot.local/problems/provider-timeout",
  "title": "El proveedor de video no respondió a tiempo",
  "status": 504,
  "detail": "veo: timeout tras 300 s y 3 reintentos (backoff 2 s)",
  "instance": "/api/v1/scenes/3c1f…/generate-video",
  "code": "PROVIDER_TIMEOUT",
  "provider": "veo",
  "sceneId": "3c1f…",
  "retryable": true,
  "traceId": "tr-77aa…"
}
```

Caso PROVEEDOR no configurado (fail fast sin llamar al proveedor):

```json
{
  "type": "https://airshot.local/problems/provider-not-configured",
  "title": "El proveedor no está configurado",
  "status": 409,
  "detail": "No existe ProviderConfig activo para kling; configura la API key en Configuración",
  "instance": "/api/v1/scenes/3c1f…/generate-video",
  "code": "PROVIDER_NOT_CONFIGURED", "provider": "kling", "retryable": false,
  "hints": ["POST /api/v1/provider-configs"],
  "traceId": "tr-b1c2…"
}
```

#### E-5 — Ensamblar

`POST /api/v1/projects/0f9d…/assemble` con `{ "includeAudio": true, "musicVolume": 0.3 }` → `202`:

```json
{
  "id": "job-8821…", "projectId": "0f9d…", "jobType": "assembly", "status": "pending",
  "params": { "includeAudio": true, "musicVolume": 0.3, "outputResolution": "1080p",
              "fps": 24, "musicAssetKey": null },
  "outputPath": null, "errorMessage": null, "createdAt": "2025-06-02T10:00:00Z"
}
```

Sondeo `GET /api/v1/assemblies/job-8821…` hasta `completed` con `outputPath` o `failed` con `errorMessage` (problem). Estado inválido (escena sin clip):

```json
{
  "type": "https://airshot.local/problems/assembly-incomplete",
  "title": "El proyecto no está listo para ensamblarse",
  "status": 409,
  "detail": "3 de 18 escenas sin clip de video y 1 sin narración (assembly.require_audio=true)",
  "code": "ASSEMBLY_INCOMPLETE_SCENES", "retryable": false,
  "hints": ["Completa las escenas marcadas o ajusta assembly.require_audio en config.yaml"],
  "traceId": "tr-3e4f…"
}
```

#### E-6 — Subida de música con 413 (payload excesivo)

```json
{
  "type": "https://airshot.local/problems/payload-too-large",
  "title": "El archivo supera el límite",
  "status": 413,
  "detail": "60 MiB > upload.music.max_bytes (50 MiB); el tope global de body es app.max_body_bytes",
  "instance": "/api/v1/projects/0f9d…/music",
  "code": "PAYLOAD_TOO_LARGE", "retryable": false,
  "hints": ["Comprime la pista o ajusta upload.music.max_bytes en config.yaml"],
  "traceId": "tr-5f6a…"
}
```

#### E-7 — Error de autorización del proveedor (502 `PROVIDER_AUTH`)

```json
{
  "type": "https://airshot.local/problems/provider-auth",
  "title": "El proveedor rechazó las credenciales",
  "status": 502,
  "detail": "veo respondió 401 (API key inválida); el código original del proveedor se conserva en detail",
  "instance": "/api/v1/scenes/3c1f…/generate-video",
  "code": "PROVIDER_AUTH", "provider": "veo", "retryable": false,
  "hints": ["Revisa la API key en Configuración → Proveedores"],
  "traceId": "tr-8d9e…"
}
```

#### E-8 — Fallo crítico (500 `INTERNAL_ERROR`)

```json
{
  "type": "https://airshot.local/problems/internal-error",
  "title": "Error interno no controlado",
  "status": 500,
  "detail": "Error no controlado; revise el log del servidor con este traceId",
  "code": "INTERNAL_ERROR", "retryable": false,
  "traceId": "tr-c1d2…"
}
```

### 3.4 Contrato asíncrono y sondeo

- `generate-video`, `assemble` y `audio-qa` devuelven 202 y exponen su estado vía recurso sondeable (escena o job). Transiciones: escena `video_pending → video_ready | failed`; job `pending → running → completed | failed`. Los errores de proveedor persisten en `lastError`/`errorMessage` como snapshot RFC 7807.
- `StoryboardService`, `generate-image` y `generate-audio` son síncronos (latencias de segundos; ADR-014) con timeout de request `app.request_timeout_seconds`. Coherencia validada en arranque: `app.request_timeout_seconds` ≥ peor caso síncrono (timeout de proveedor × (`max_retries` + 1) + backoff acumulado) — regla del Anexo A.
- El frontend sondea con `refetchIntervalMs` configurable (§5.2) solo mientras haya estados `*_pending` o jobs `pending/running`.
- WebSockets: descartados en v1 (ver §1.8); el sondeo corto en single-user es suficiente y más simple de operar localmente.

### 3.5 Subidas y almacenamiento

- Validación de subidas (imagen base, imagen de referencia, música): `Content-Length` ≤ límite de config (`upload.*`) → si no, 413 ANTES de leer el cuerpo completo; mimetype ∈ whitelist → 415; verificación de magic bytes (formato real vs. extensión declarada) → 415 `UNSUPPORTED_MEDIA` con detalle.
- El `storageKey` lo genera SIEMPRE el servidor (UUID + convención de directorios `uploads|outputs/projects/{projectId}/…`); el nombre de archivo del usuario solo se guarda como metadato en la BD, nunca como ruta (previene path traversal).
- `StorageService` (puerto): `save(key, bytes)`, `open(key)`, `delete(key)`, `exists(key)`, `resolve_url(key)`; implementación `LocalFSStorage` con contención de rutas. Ruta a S3/MinIO futura: nueva implementación del puerto (ADR-002).

---

## FASE 4 — Lógica de Inserción Extensible (JSON genérico validado)

### 4.1 Objetivo y regla de extensibilidad

El sistema recibe un **JSON genérico** para crear/editar `Reference` con atributos variables (`eyeColor`, `hairColor`, `outfit`, …) y debe: (1) aceptar claves nuevas sin cambios en backend ni en esquema relacional (regla del «Carro» del LISTÓN); (2) rechazar todo lo peligroso o fuera de límites con un error explícito (nunca descarte silencioso). La decisión de fondo (JSONB + JSON Schema vs EAV vs columnas) está justificada en §2.5; esta fase define el mecanismo de control completo.

### 4.2 Esquema de validación y sus controles (todos los límites viven en config)

`ReferenceValidator` (servicio de dominio, sin I/O) valida `attributes` contra el JSON Schema versionado `reference-attributes.schema.json` (Anexo C) **más** una pasada imperativa para las restricciones que JSON Schema no expresa de forma portable. Controles, cada uno con su clave de `config.yaml` (sección `reference.*`) y su código de error 422:

| Control | Regla | Clave config | `code` del problema |
|---|---|---|---|
| C-01 Campos permitidos en el nivel superior | El modelo Pydantic de request solo acepta las claves del contrato (`type`, `name`, `description`, `libraryScope`, `projectId`, `level`, `attributes`); clave desconocida → rechazo | — (contrato Pydantic `extra="forbid"`) | `UNEXPECTED_FIELD` |
| C-02 Tipos de valor aceptados | `string` \| `number` **finito** \| `boolean` \| `null` \| `array` de escalares \| `object` (anidado un nivel) | — (Anexo C) | `ATTRIBUTE_VALUE` |
| C-03 Tamaño máximo del JSON de atributos | bytes del payload serializado | `attributes_max_json_bytes` (16384) | `ATTRIBUTE_LIMIT` |
| C-04 Número máximo de claves | — | `attributes_max_fields` (32) | `ATTRIBUTE_LIMIT` |
| C-05 Profundidad máxima | recorrido imperativo de profundidad (JSON Schema no tiene restricción nativa portable de profundidad) | `attributes_max_depth` (2) | `ATTRIBUTE_DEPTH` |
| C-06 Longitud máxima de valores string | en **code points** Unicode (el total en bytes lo acota C-03) | `attributes_max_value_length` (200) | `ATTRIBUTE_VALUE` |
| C-07 Tamaño máximo de arrays | — | `attributes_max_array_items` (8) | `ATTRIBUTE_VALUE` |
| C-08 Nombres de clave seguros | regex `^[a-z][a-zA-Z0-9]{0,31}$` (sin `__`, sin `$`, sin puntos) **más** denylist de nombres peligrosos (`constructor`, `prototype`, `hasownproperty`, `tostring`, `valueof`) comparados en minúsculas; aplicado también al objeto anidado | `dangerous_key_denied` + Anexo C `propertyNames` (nivel superior y anidado) | `ATTRIBUTE_NAME` |
| C-09 Claves sensibles prohibidas | denylist configurable, comparación en minúsculas; conjunto efectivo = **unión** de config y Anexo C (nunca intersección) | `sensitive_key_denied` | `SENSITIVE_KEY` |
| C-10 Valores desconocidos pero válidos | **se aceptan** (extensibilidad): cualquier clave que pase C-02..C-09 entra en `attributes` | — | — (201/200) |
| C-11 Versionado | sello `attributesSchemaVersion="v1"` en escritura; lectura tolera versiones anteriores | — | — |
| C-12 Claves del objeto anidado | límite de claves del nivel 2 y mismas reglas C-08/C-09 recursivas | `attributes_max_nested_fields` (8) | `ATTRIBUTE_LIMIT` / `ATTRIBUTE_NAME` |
| C-13 Claves duplicadas en el JSON crudo | rechazo explícito en el parser (object_pairs_hook) — nunca «última gana» en silencio | — (mecanismo del parser) | `VALIDATION_ERROR` |

La pasada imperativa (C-03/C-05/C-06/C-07 y C-12/C-13) existe porque JSON Schema (draft-07, la más portable entre validadores Python `jsonschema`) no garantiza límites de bytes ni profundidad sin extensiones no estándar. Coste aceptado: ~40 líneas de código imperativo. Alternativa descartada: subir a draft 2020-12 con `$defs` + recursion — no cierra ni bytes ni profundidad y añade dependencia de versión de validador.

### 4.3 Flujo end-to-end de inserción

```
Cliente → POST /api/v1/references
  body: { "type": "character", "name": "Vera", "level": "advanced",
          "libraryScope": "project", "projectId": "0f9d…",
          "attributes": { "eyeColor": "brown", "hairColor": "castaño",
                          "outfit": { "top": "white shirt", "bottom": "navy pants" } } }
        │
        ▼
ReferencesController (presentation)
  · Pydantic ReferenceCreateRequest (extra="forbid" ⇒ C-01)
  · libraryScope=project exige projectId; global exige projectId null (INV-04)
        │
        ▼
CreateReferenceUseCase (application)
  · llama ReferenceValidator.validate(attributes)  [C-02..C-10 del §4.2]
  · error ⇒ 422 con problema RFC 7807 (code específico + campo)   ← nunca descarte silencioso
        │
        ▼
ReferenceFactory.create(...)  (domain)
  · sella attributesSchemaVersion="v1"
  · normaliza scope/projectId; defaults de level
        │
        ▼
SqlAlchemyReferenceRepository.save (infrastructure)
  · INSERT con attributes serializado JSON → columna JSONB (TEXT en SQLite)
        │
        ▼
201 ReferenceResponse (echo de attributes validado)
```

### 4.4 Controles de seguridad (riesgo → control → prueba)

| Riesgo | Control | Efecto |
|---|---|---|
| Path/prototype pollution (`__proto__`, `constructor`, `$type`) | C-08 (regex + denylist `dangerous_key_denied`) + `extra="forbid"` en nivel superior; además la serialización JSON de Python no arrastra prototipos — defensa en profundidad declarada | 422 `ATTRIBUTE_NAME` |
| Exfiltración/almacenamiento de secretos en atributos | C-09 denylist de claves sensibles | 422 `SENSITIVE_KEY` |
| DoS por payload gigante | límite de body global (`app.max_body_bytes`, 413) + C-03/C-04 | 413 / 422 `ATTRIBUTE_LIMIT` |
| DoS por anidamiento profundo (parser) | C-05 profundidad | 422 `ATTRIBUTE_DEPTH` |
| Inyección SQL | los valores van serializados a JSON en columna (sin concatenación); consultas parametrizadas en repos | n/a estructural |
| Inyección en prompts | `PromptComposer` cita valores de atributos con comillas y límite de longitud (C-06); no interpola SQL/shell | n/a estructural |

Declaración explícita: no se pretende detectar secretos por el **contenido** de valores (falsos positivos innecesarios en una herramienta local); el control es por **nombre de clave** y está configurado (C-09). Este es un alcance decidido, no una omisión.

### 4.5 Versionado del esquema de atributos

- Política de compatibilidad: **cambios aditivos** (nuevas claves permitidas, restricciones relajadas) → sube versión menor del JSON Schema (v1.1) sin migración de datos; los documentos sellados con versiones anteriores siguen siendo válidos de lectura.
- **Cambios rompientes** (renombres, restricciones nuevas que invalidan datos existentes) → requieren revisión Alembic de datos (recorrido por `references`, revalidación, reporte de rechazos) y una decisión explícita de ADR. No se hacen «en silencio».
- El sello `attributesSchemaVersion` permite al `ReferenceRenderer` (F5) decidir cómo mostrar datos viejos (p. ej., claves hoy desconocidas → sección «atributos adicionales»).

### 4.6 Semántica de escritura aplicada a `attributes` (taxonomía §3.1.1 aplicada)

| Caso en `PATCH /references/{id}` | Comportamiento |
|---|---|
| `attributes` ausente del payload | no se toca (valor previo intacto) |
| `attributes: null` | 422 `VALIDATION_ERROR` — el campo es no-nullable (§2.3: «sin atributos» se representa con `{}`) |
| `attributes: { … }` | **sustitución completa** del objeto (semántica declarada; para edición parcial de una clave, el cliente envía el objeto merged resultante; el use case re-valida al completo y **re-sella** `attributesSchemaVersion` con la versión vigente) |
| clave nueva dentro (p. ej. `hairColor`) | aceptada si pasa C-02..C-10 (extensibilidad) |
| clave con valor inválido (array de objetos) | 422 `ATTRIBUTE_VALUE` con ruta del campo |
| `attributes` no es objeto (p. ej. `[]` o `"str"`) | 422 `VALIDATION_ERROR` con `field=attributes` (el DTO declara `attributes: dict[str, JsonValue]`) |
| temporal / auth de proveedor / configuración / crítico en escritura | temporal, auth y configuración no aplican estructuralmente a una escritura local síncrona sin proveedor externo (declaración de imposibilidad, no omisión); un bug del validador → 500 `INTERNAL_ERROR` (taxonomía §3.1.1) |

### 4.7 Frontend: registro de atributos conocidos (display config, no contrato)

El `ReferenceRenderer` (F5 §5.4 — nombre lógico de la composición de las moléculas `ReferenceCard` + `AttributeRows`, §6.2) no conoce el universo de claves: mantiene un **registro de presentación** (fichero `src/config/reference-attributes.display.ts`) que mapea claves conocidas → etiqueta en español + tipo de visualización. Las claves no registradas se renderizan en la sección «Atributos adicionales». Promover `hairColor` de «adicional» a «conocido» = editar solo ese fichero de presentación (cambio frontend, opcional, sin backend).

### 4.8 Ejemplo end-to-end de extensibilidad (regla del «Carro» del LISTÓN)

Escenario del enunciado: mañana se añade el proveedor de video **ProviderX** y el atributo **`hairColor`** a personajes.

**A) Nuevo proveedor ProviderX — flujo sin modificar el núcleo:**

1. Se implementa `ProviderXVideoProvider` en `app/infrastructure/providers/providerx.py` cumpliendo el puerto `VideoProvider` (F6 §6.4: `generate`, `validate_config`, `capabilities → supported_durations, reference_image_limit`).
2. Se registra en `providers.yaml` (Anexo B) con sus parámetros estáticos: `adapter`, `base_url`, `timeout_seconds`, `max_retries`, `backoff_base_seconds`, `max_concurrent`, `supported_durations`, `reference_image_limit`.
3. El usuario crea su `ProviderConfig` por API/UI (`providerType=video`, `providerName=providerx`, apiKey cifrada).
4. El proyecto elige `videoProvider="providerx"` (PATCH project).
5. Flujo en ejecución **sin cambios en Scene, Project, use cases ni controllers**:

```
SceneController(POST /scenes/{id}/generate-video)
  → GenerateSceneVideoUseCase
      → VideoProviderFactory.create("providerx")   ← resuelve registry + ProviderConfig
      → ProviderXVideoProvider.generate(VideoGenerationRequest)
  → StorageService.save(clip) → SceneRepository.update(path, status)
```

Comparación con la alternativa descartada: con `if provider == "veo": … elif …` en el use case, cada proveedor nuevo exige editar y re-testear el núcleo — exactamente lo que el LISTÓN prohíbe.

**B) Nuevo atributo `hairColor` — flujo sin modificar núcleo ni esquema:**

1. El usuario envía `POST /api/v1/references` con `attributes: {"hairColor": "castaño"}`.
2. `ReferenceValidator`: la clave pasa C-08 (regex) y no está en C-09 → **aceptada** (C-10).
3. Se persiste en `attributes` (JSONB) con sello v1 — sin ALTER TABLE, sin tocar entidades, repos ni use cases.
4. `PromptComposer` incluye dinámicamente los atributos del nivel `advanced`/`cinematic` al construir `promptEn` de las escenas donde la referencia está asignada como `subject` (recorre `attributes` como diccionario, no hay lista fija de campos en el código).
5. `ReferenceRenderer` la muestra (en «adicionales» hasta que se registre su etiqueta — §4.7).

**C) Distinción explícita** (exigida por el LISTÓN): añadir un atributo o un proveedor compatible = **datos/variantes compatibles** (cerrojos en config y registro; sin tocar núcleo). Añadir **comportamiento de negocio nuevo** (p. ej., un tipo de asset distinto como video de transición, o un paso nuevo en el pipeline) sí puede requerir código, pruebas y despliegue — se declara sin ambigüedad: la extensibilidad garantizada es la de los ejes de variabilidad aislados por puertos (proveedores, storage, ensamblaje) y la de datos dinámicos (atributos JSONB), no la de reescribir la semántica del pipeline gratis.

---

## FASE 5 — Estrategia de Renderizado Dinámico y Listas

### 5.1 Principios de renderizado

1. **Clave = UUID, nunca el índice.** Toda lista (`scenes`, `references`, `visualStyles`, `voices`, `jobs`, `providerConfigs`) renderiza `key={item.id}`. El reordenamiento (`PUT /scenes/order`) y el borrado intermedio no desmontan tarjetas equivocadas (React reconcilia por clave; con índice reutiliza nodos con datos cruzados — defecto clásico que el LISTÓN prohíbe).
2. **Iteración dinámica sobre los datos, no sobre un molde fijo**: los componentes no enumeran campos de `Scene`/`Reference` «a mano»: renderizan a partir de los DTOs del API y del registro de presentación (§4.7). Campos nuevos del DTO aparecen sin tocar componentes (los DTOs TypeScript se generan/escriben espejo del contrato Pydantic de F3).
3. **Los límites de negocio llegan del backend**: `useRuntimeConfig()` (TanStack Query sobre `GET /api/v1/config`) alimenta `DurationSlider` (min/default/max), límites de subida y whitelists. El frontend **no duplica** rangos de negocio (cero hardcoding, §1.9).
4. Las constantes UI que sí viven en el frontend (`src/config/app.config.ts`) son solo de rendimiento, con valor y motivo declarados aquí: umbral de virtualización (50 — por encima, el DOM crece linealmente), alturas estimadas (px — cálculo del virtualizador), `staleTimeMs` (15 000 — evita refetch al alternar pestañas del workspace), `retryCount` (2 — red local; más reintentos solo molestan), `refetchIntervalMs` (2 000 — sondeo de `*_pending`/jobs). El fichero repite estos motivos en comentarios.

### 5.2 Estructura de queries (TanStack Query) e invalidación

Claves canónicas (siempre con el identificador estable, nunca índices):

```
['runtime-config']
['projects', {filters}]                          → useInfiniteQuery (cursor = pageParam)
['project', projectId]
['scenes', projectId, {filters}]                → useInfiniteQuery (sortBy=order)
['scene', sceneId]
['references', {scope, projectId, filters}]      → useInfiniteQuery
['visual-styles', {origin}]                      → useInfiniteQuery
['provider-configs', {providerType}]             → useInfiniteQuery
['tts-voices', {provider}]                       → useInfiniteQuery
['assemblies', projectId]                         → useInfiniteQuery
['assembly', jobId]
```

El cursor nunca forma parte de la clave (es `pageParam` interno de `useInfiniteQuery`); **toda** colección marcada **P** en §3.2 se consume como lista infinita — ninguna lista de entidad se trunca a la primera página.

Matriz de invalidación (mutación → qué se invalida):

| Mutación | Invalida |
|---|---|
| `POST /projects` | `['projects']` |
| `POST /projects/{id}/storyboard` | `['project', id]`, `['scenes', id]` (refetch completo: reemplaza escenas) |
| `PATCH /scenes/{id}` | `['scene', id]` + entrada correspondiente en el caché de `['scenes', projectId]` (actualización de caché por matcher de `id`) |
| `PUT /scenes/order` | `['scenes', projectId]` |
| `generate-image`/`image`/`delete asset` | `['scene', id]` |
| `generate-video` (202) | `['scene', id]` con `refetchInterval` activo mientras `status=video_pending` |
| `generate-audio` | `['scene', id]` |
| `POST /projects/{id}/assemble` | `['assemblies', id]` + sondeo del job creado |
| `PATCH /projects/{id}` | `['project', id]` + `['projects']` |
| `DELETE /projects/{id}` | `['projects']` + purga de `['project', id]`, `['scenes', id]`, `['assemblies', id]` |
| `POST /projects/{id}/music` / `DELETE …/music` | `['project', id]` |
| `POST /projects/{id}/audio-qa` | `['assemblies', id]` + sondeo del job creado |
| `DELETE /scenes/{id}` | `['scenes', projectId]` + purga de `['scene', id]` + `['project', id]` (estado/`sceneCount`) |
| `PUT /scenes/{id}/references` | `['scene', id]` (confirmación post-optimista) |
| imágenes de referencia (`POST`/`DELETE`/`PATCH /references/{id}/images…`) | `['references', …]` + `['reference', id]` |
| CRUD referencias/estilos/configs | la lista y el detalle correspondientes |

Regla general: toda mutación 2xx invalida el detalle de su recurso y su lista canónica; la matriz enumera los casos no triviales (matchers por `id`, purgas y sondeos).

Sondeo: `refetchIntervalMs` de `app.config.ts` solo mientras existan estados pendientes (la condición se evalúa con los datos en caché; sin estados pendientes el sondeo se apaga — sin temporizadores zombis).

### 5.3 Virtualización de listas grandes

- `StoryboardList` y `ReferenceLibrary` usan `@tanstack/react-virtual` cuando `items.length > virtualization.threshold` (50). Por debajo del umbral se renderiza la lista normal — el virtualizador no aporta con decenas de nodos y complica la accesibilidad por teclado (declaración de coste). El umbral es constante de rendimiento UI documentada (§5.1 p.4), no un límite de negocio.
- Esquema (ilustrativo del mecanismo, no código de producción):

```tsx
const parentRef = useRef<HTMLDivElement>(null);
const { data } = useInfiniteScenes(projectId);          // cursor infinito
const rows = useMemo(() => data.pages.flatMap(p => p.items), [data]);
const virtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => APP_CONFIG.virtualization.sceneRowEstimatePx,
  overscan: APP_CONFIG.virtualization.overscan,
  getItemKey: (index) => rows[index].id,               // clave estable UUID, no index
});
```

- `useVirtualizer` con `getItemKey` por `id` mantiene la identidad de los nodos al hacer scroll y al invalidar páginas (React reutiliza el componente correcto).
- «Cargar más» infinito: el sentinel de `useInfiniteQuery` (`fetchNextPage`) se monta como fila virtual final con una **clave reservada fuera del dominio** (`'__load-more__'`); `getItemKey` la devuelve para el índice final (`count = items + 1`) y el cursor del API alimenta la siguiente página.
- Límites prácticos declarados: DOM simultáneo ≈ viewport/altura + overscan (decenas de nodos); memoria del caché acumulada de páginas cargadas (lineal en lo ya cargado — si el usuario recorre 10.000 escenas, el caché crece; se declara y se mitiga con `gcTime` que descarta páginas lejanas si el componente se desmonta); ancho de banda acotado por `pagination.max_page_size` del backend.

### 5.4 Manejo de campos ausentes, nulos y desconocidos (tabla por componente)

Taxonomía §3.1.1 aplicada al render (ausente ≠ null ≠ desconocido):

| Componente | Campo | Ausente / null | Valor desconocido |
|---|---|---|---|
| `SceneCard` | `imageBasePath`/`videoClipPath`/`audioPath` | `null` → chip de estado «pendiente» (semántica §2.3) — nunca se inventa placeholder de imagen | — |
| `SceneCard` | `lastError` | `null` → sin badge de error | `code` del problema no mapeado → badge genérico «Error no clasificado» con `traceId` visible (no se oculta) |
| `ReferenceCard` | `attributes.eyeColor` | clave ausente → la fila no se renderiza (ausencia ≠ dato) | clave no registrada → sección «Atributos adicionales» |
| `ReferenceCard` | `attributes.eyeColor = null` | valor null explícito → fila con «—» y tooltip «Valor nulo registrado» (null ≠ ausente, se muestra) | ídem |
| `ReferenceCard` | `attributes.someKey` de tipo objeto | se renderizan sus sub-pares (profundidad ≤ 2 validada en backend) | ídem |
| `StylePicker` | `description` | `null` → sin subtítulo (ausencia documentada) | — |
| `ErrorNotice` | `hints[]` | ausente → solo detalle | ídem |

Regla general: **ausente ⇒ omitir la fila; null ⇒ mostrar «—»; desconocido ⇒ mostrar con marcado claro**. Ninguna conversión silenciosa a valores por defecto visuales (LISTÓN: no ocultar la diferencia).

### 5.5 Estados de carga, vacío, error y reintento (por organismo)

| Organismo | Cargando | Vacío | Error | Reintento |
|---|---|---|---|---|
| `StoryboardList` | skeletons de altura = `sceneRowEstimatePx` (evita salto al hidratar el virtualizador) | «Aún no hay escenas. Genera el storyboard» + CTA a UC-02 | `ErrorNotice` con problema RFC 7807 → título traducido + `detail` + `hints`; `retryable=true` ⇒ botón «Reintentar» que re-lanza la mutación | botón reintentar; `retryCount` de config |
| `ReferenceLibrary` | skeletons de tarjeta con altura = `referenceCardEstimatePx` (misma regla de acoplamiento al virtualizador que `StoryboardList`, evita salto de scroll al hidratar) | «Biblioteca vacía» + CTA crear/subir | ídem; `PROVIDER_AUTH` ⇒ CTA directo a `SettingsPage` (acción accionable, no mensaje críptico) | ídem |
| `ProviderSettingsForm` | skeletons de filas | (no aplica: siempre lista al menos los proveedores registrados desde `GET /config`) | error de `POST /{id}/test` mostrado inline con `code` | re-test manual |
| `AssemblyPanel` | job `pending/running` → barra de progreso indeterminada + estado | sin jobs: CTA «Ensamblar» (deshabilitado si INV-09 no se cumple, con razón exacta: qué escenas faltan) | `errorMessage` (problem) con botón reintentar si `retryable` | ídem |
| `ProjectsPage` | skeletons | «Sin proyectos» + CTA | `ErrorNotice` | ídem |
| `AudioQAPanel` | skeletons | deshabilitado con explicación si `audio_qa.earshot.enabled=false` (cómo activarlo en config) | 503 `PROVIDER_UNAVAILABLE` con remediación | reintentar |
| `MusicPicker` | — | «Sin música» + CTA subir | 413/415 inline con `hints` | reintentar |
| `StylePicker` | skeletons | (no aplica: siempre hay estilos seed) | error de lista | reintentar |
| `ProjectForm` | — | — | 422 campo a campo con `hints` | reintentar |

Regla de accesibilidad: los mensajes de error usan `role="alert"` (aria-live), los skeleton `aria-busy`, las acciones de reintento son focuseables. En listas virtualizadas: navegación por teclado con roving tabindex dentro de la ventana visible y `aria-rowcount`/`setsize` con el total conocido (páginas cargadas).

### 5.6 Actualizaciones optimistas acotadas

- Se aplican solo a `PATCH /scenes/{id}` (duración, prompt, textos) y `PUT /scenes/references` — operaciones de conflicto bajo con un único usuario local.
- Mecanismo: actualizar el caché de `['scene', id]`/entrada de lista de inmediato, rollback automático del previous snapshot si la mutación falla, y `ErrorNotice` con el problema real. El rollback evita el estado fantasma «parece guardado pero no lo está» (LISTÓN: no ocultar errores).
- NO se aplican optimistas a generación de assets ni ensamblaje (operaciones largas con estados asíncronos: sería fingir un estado inexistente).

### 5.7 Rendimiento y límites declarados

- `React.memo` en `SceneCard` y `ReferenceCard` con comparador explícito (`id`, `status`, `durationSeconds`, paths de assets, `level`, `name`, `attributes` por igualdad superficial — suficiente porque PATCH sustituye `attributes` por completo, §4.6; dependencia declarada): problema que resuelve — al parchear una escena, no re-renderizar las otras 199 tarjetas del storyboard. Coste — mantener el comparador al añadir props visibles. Alternativa descartada — re-render completo.
- Re-renders inevitables declarados: cambio de filtro/sort reconstruye la lista (invalidación de query) — acotado por página.
- Ningún `useEffect` con fetch manual en organismos (condiciones de carrera); toda lectura pasa por TanStack Query (§1.6).
- Declaración de límite real: la virtualización optimiza el DOM, no el tamaño del caché acumulado; con >10.000 escenas cargadas en una sesión, el caché de cliente ocupa memoria proporcional (documentado; mitigación `gcTime`).

---

## FASE 6 — Código Fuente (Esqueleto preparado; SIN implementación)

**Estado vinculante**: el enunciado pide planificación y deja la implementación «preparada pero no generada». Por tanto, esta fase contiene **exclusivamente**: estructura de archivos prevista, comandos de instalación/ejecución reproducibles para cuando se implemente, interfaces clave (puertos) con firma completa, dependencias previstas y estrategia de pruebas. **No hay archivos de implementación de AirShot escritos en este entregable** y no se afirma haber ejecutado ninguno de los comandos.

### 6.1 Estructura de archivos prevista (backend)

```
( raíz del repositorio )
├─ Makefile                  # targets: install, dev, test, test-slow, lint, migrate, seed, run
├─ docker-compose.yml        # esquema en §6.3
├─ .env.example              # AIRSHOT_SECRET_KEY documentado (sin valor real)
└─ backend/
   ├─ Dockerfile             # python:3.11-slim + ffmpeg (apt) + pip install -e ".[dev]"
   ├─ pyproject.toml         # dependencias (sección 6.5)
   ├─ Makefile               # targets: install, dev, test, test-slow, lint, migrate, seed
   ├─ config.yaml            # límites de negocio (Anexo A) — copiar desde config.example.yaml
   ├─ config.example.yaml    # plantilla sin secretos, versionada
   ├─ providers.yaml         # registro de proveedores (Anexo B) — versionado, sin secretos
   ├─ styles.yaml            # semilla de estilos visuales (dato, no código)
   ├─ alembic.ini
   ├─ alembic/versions/0001_initial.py …
   ├─ schemas/reference-attributes.schema.json   # JSON Schema v1 (Anexo C)
   ├─ tests/                 # ver §6.6
   └─ app/
      ├─ main.py             # composition root: crea FastAPI, DI de repos/puertos/factories
      ├─ core/
      │  ├─ config.py        # Pydantic Settings sobre config.yaml + env (AIRSHOT_*)
      │  ├─ errors.py        # ErrorKind (taxonomía §3.1.1), AppError, handlers RFC 7807
      │  └─ logging.py       # traceId por request, nunca API keys
      ├─ domain/
      │  ├─ entities/        # base.py (IEntity), project.py, scene.py, scene_reference.py,
      │  │                   # reference.py, visual_style.py, provider_config.py, assembly_job.py
      │  ├─ ports/           # video_provider.py, tts_provider.py, llm_provider.py,
      │  │                   # image_provider.py, audio_qa_provider.py, storage.py,
      │  │                   # assembly.py, repositories.py
      │  ├─ services/        # prompt_composer.py, duration_mapper.py, reference_validator.py,
      │  │                   # reference_factory.py, storyboard_splitter.py (puros, sin I/O)
      │  └─ enums.py         # ProjectStatus, SceneStatus, ReferenceType, LibraryScope,
      │                      # ReferenceLevel, ProviderType, JobType, JobStatus…
      ├─ application/        # use cases: create_project.py, generate_storyboard.py,
      │                      # generate_scene_image.py, generate_scene_video.py,
      │                      # generate_scene_audio.py, assemble_project.py,
      │                      # run_audio_qa.py, crud_references.py, crud_styles.py,
      │                      # crud_provider_configs.py
      │                      # (la fachada "StoryboardService" citada en F1–F3 =
      │                      #  generate_storyboard.py + storyboard_splitter.py)
      ├─ infrastructure/
      │  ├─ persistence/     # database.py (async engine aiosqlite + PRAGMA foreign_keys),
      │  │                   # models/ (ORM), repos/ (7 repos: una interfaz por entidad)
      │  ├─ providers/       # factories.py (Video/TTS/LLM/Image/AudioQA ProviderFactory),
      │  │                   # registry.py + adapters: veo.py, kling.py, runway.py, luma.py,
      │  │                   # voicestudio.py, elevenlabs.py, llm_openai_compat.py,
      │  │                   # image_openai_compat.py, earshot.py
      │  ├─ storage/local_fs.py  # StorageService → ./data (contención de rutas)
      │  └─ assembly/ffmpeg_service.py  # AssemblyService (subprocess, sin shell)
      └─ presentation/
         ├─ api/             # routers: projects, scenes, references, visual_styles,
         │                   # provider_configs, assemblies, tts, config, health, media
         ├─ schemas/         # DTOs Pydantic request/response (extra="forbid")
         └─ dependencies.py  # get_current_user (stub LocalUser), get_db, get_services
```

### 6.2 Estructura de archivos prevista (frontend)

```
frontend/
├─ package.json  vite.config.ts  tsconfig.json  index.html
└─ src/
   ├─ main.tsx  App.tsx (react-router-dom)
   ├─ config/
   │  ├─ app.config.ts               # constantes de rendimiento UI (§5.1 p.4) comentadas
   │  └─ reference-attributes.display.ts  # registro de presentación de atributos (§4.7)
   ├─ api/
   │  ├─ client.ts                   # fetch wrapper: cursor, problem+json → AppProblem
   │  └─ endpoints/                   # projects.ts, scenes.ts, references.ts, styles.ts,
   │                                 # providers.ts, assemblies.ts, config.ts, voices.ts
   ├─ types/domain.ts                 # DTOs espejo del contrato F3 (TS estricto)
   ├─ stores/workspace.store.ts        # Zustand: selección, pestaña, borradores
   ├─ hooks/                          # useProjects, useInfiniteScenes, useReferences,
   │                                  # useRuntimeConfig, useAssemblies… (TanStack Query)
   ├─ components/
   │  ├─ atoms/     # Button, Badge, DurationSlider, StatusChip, TextField, ConfirmDialog
   │  ├─ molecules/ # SceneCard, ReferenceCard, PromptEditor, AssetPreview, VoicePicker,
   │  │             # LevelSelector, AttributeRows, ErrorNotice, ReferenceForm, AudioPanel,
   │  │             # GenerateVideoDialog
   │  │             # (el "ReferenceRenderer" de §4.7 = ReferenceCard + AttributeRows)
   │  └─ organisms/ # StoryboardList, ReferenceLibrary, ProviderSettingsForm,
   │                # AssemblyPanel, AudioQAPanel, MusicPicker, StylePicker, ProjectForm
   ├─ pages/       # ProjectsPage, ProjectWorkspacePage (tabs), SettingsPage
   └─ tests/       # ver §6.6
```

### 6.3 Comandos de instalación y ejecución (reproducibles al implementar)

```bash
# --- Backend (Python 3.11+) ---
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp config.example.yaml config.yaml        # editar secretos: AIRSHOT_SECRET_KEY en .env
alembic upgrade head                       # crea SQLite ./data/airshot.db + seeds de estilos
uvicorn app.main:app --reload --port 8000  # API en http://127.0.0.1:8000 (OpenAPI: /docs)

# --- Frontend (Node 20+ / bun) ---
cd frontend
npm ci            # o: bun install
npm run dev -- --port 5173

# --- Todo junto ---
make run         # alias de docker compose up (abajo) en la raíz del repo
docker compose up
```

`docker-compose.yml` previsto (esquema):

```yaml
services:
  backend:
    build: { context: ./backend }   # Dockerfile: python:3.11-slim + ffmpeg (apt) + pip install -e .
    command: sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"
    volumes: ["./data:/app/data"]
    ports: ["8000:8000"]
  frontend:
    image: node:20-alpine
    command: sh -c "npm ci && npm run dev -- --host 0.0.0.0 --port 5173"
    volumes: ["./frontend:/app"]
    ports: ["5173:5173"]
    environment:
      - VITE_API_BASE_URL=http://127.0.0.1:8000
```

(Nota de honestidad: estos comandos corresponden al árbol de §6.1/§6.2 que **aún no existe**; se declaran para que el implementador los reproduzca exactamente cuando genere el código de la Fase 6.)

### 6.4 Interfaces clave (puertos; firmas completas, sin cuerpo)

```python
# app/domain/ports/video_provider.py
class VideoProvider(Protocol):
    name: ClassVar[str]

    async def generate(self, request: VideoGenerationRequest) -> VideoGenerationResult: ...
    # VideoGenerationRequest: sceneId, promptEn, durationSeconds (ya mapeada),
    #   imageBaseKey, referenceImageKeys (lista según nivel y límite del proveedor), resolution, seed?
    # VideoGenerationResult: clipBytes (el use case persiste vía StorageService),
    #   effectiveDurationSeconds, providerJobId

    async def validate_config(self, config: ProviderConfig, registry: ProviderRegistryEntry) -> None: ...
    # lanza PROVIDER_AUTH / PROVIDER_NOT_CONFIGURED según taxonomía

    def capabilities(self) -> VideoProviderCapabilities: ...
    # supported_durations: list[int] | None (None = continuo en [min,max]),
    #   reference_image_limit: int, max_resolution: str

# app/domain/ports/tts_provider.py
class TTSProvider(Protocol):
    name: ClassVar[str]
    async def synthesize(self, request: TTSSynthesisRequest) -> TTSSynthesisResult: ...
    # request: text, voiceId (None → default), speed?, responseFormat ("wav")
    # result: audioBytes, durationSeconds, effectiveVoiceId
    async def list_voices(self, cursor: str | None, limit: int) -> VoicePage: ...
    async def validate_config(self, config: ProviderConfig, registry: ProviderRegistryEntry) -> None: ...

# app/domain/ports/llm_provider.py
class LLMProvider(Protocol):
    name: ClassVar[str]
    async def complete_structured(self, request: LLMStructuredRequest) -> dict: ...
    # request: systemPromptEn, userPayload, jsonSchema, temperature
    # devuelve dict validado por el llamador con Pydantic (StoryboardOutput)
    async def validate_config(self, config: ProviderConfig, registry: ProviderRegistryEntry) -> None: ...

# app/domain/ports/image_provider.py
class ImageProvider(Protocol):
    name: ClassVar[str]
    async def generate(self, request: ImageGenerationRequest) -> ImageGenerationResult: ...
    # request: promptEn, aspectRatio ("16:9"), styleFragmentEn?, sizePreset
    async def validate_config(self, config: ProviderConfig, registry: ProviderRegistryEntry) -> None: ...

# app/domain/ports/audio_qa_provider.py
class AudioQAProvider(Protocol):
    name: ClassVar[str]
    async def analyze(self, request: AudioQARequest) -> AudioQAReport: ...
    # request: audioKeys[], features (naturalness|sync|loudness|artifacts)
    # report: metrics + findings + sfxKeys[] (si generateSfx)
    async def validate_config(self, config: ProviderConfig, registry: ProviderRegistryEntry) -> None: ...

# app/domain/ports/storage.py
class StorageService(Protocol):
    async def save(self, key: str, content: bytes) -> None: ...
    async def open(self, key: str) -> bytes: ...
    async def delete(self, key: str) -> None: ...
    async def exists(self, key: str) -> bool: ...
    def resolve_url(self, key: str) -> str: ...          # "/media/<key>"
    def new_asset_key(self, kind: AssetKind, project_id: UUID, scene_id: UUID | None, ext: str) -> str: ...

# app/domain/ports/assembly.py
class AssemblyService(Protocol):
    async def assemble(self, project: Project, scenes: list[Scene], params: AssemblyParams,
                       storage: StorageService) -> AssemblyOutcome: ...
    # params: includeAudio, musicAssetKey|None, musicVolume, resolution, fps (de config)
    # outcome: outputPath | problem (RFC 7807 snapshot) — nunca lanza sin clasificar

# app/domain/ports/repositories.py (extracto de forma)
class ProjectRepository(Protocol):
    async def add(self, entity: Project) -> Project: ...
    async def get(self, entity_id: UUID) -> Project | None: ...
    async def list_page(self, spec: ProjectListSpec) -> Page[Project]: ...
    # spec: filters(status, q), sort(createdAt), cursor, limit → Page(items, nextCursor)
    async def update(self, entity: Project) -> Project: ...
    async def delete(self, entity_id: UUID) -> None: ...
```

Tipos auxiliares de los puertos (una línea cada uno): `ProviderRegistryEntry` = entrada de `providers.yaml` (adapter, base_url, timeouts/reintentos/backoff/concurrencia, capabilities); `AssetKind` = `image | video | audio | music | report`; `VoicePage` = página de voces (`items` + `nextCursor`); `VoiceInfo = {id, name, language?, description?}`; `AssemblyOutcome = {outputPath | problem}` (snapshot RFC 7807 del fallo).

### 6.5 Dependencias previstas

Backend (`pyproject.toml`): `fastapi`, `uvicorn[standard]`, `pydantic>=2`, `pydantic-settings`, `sqlalchemy[asyncio]>=2.0`, `aiosqlite`, `alembic`, `httpx`, `jsonschema` (draft-07), `cryptography` (Fernet), `pyyaml`, `python-multipart`. Dev: `pytest`, `pytest-asyncio`, `respx` (fixtures de proveedores), `ruff`, `mypy`.

Frontend (`package.json`): `react`, `react-dom`, `typescript`, `vite`, `react-router-dom`, `@tanstack/react-query`, `@tanstack/react-virtual`, `zustand`, `tailwindcss`, `radix-ui` (vía shadcn/ui), `lucide-react`. Dev: `vitest`, `@testing-library/react`, `@playwright/test` (e2e opcional).

Ninguna dependencia adicional se introduce sin ADR (anti-sobreingeniería).

### 6.6 Estrategia de pruebas (plan; nada ejecutado en esta fase)

| Nivel | Objetivo y alcance | Herramienta prevista |
|---|---|---|
| Unitarios de dominio | `DurationMapper` (tabla de casos por proveedor), `ReferenceValidator` (C-01..C-11 incl. profundidad/bytes/denylist), `PromptComposer` (levels), máquina de estados de `Scene` | `pytest` (sin I/O) |
| Unitarios de aplicación | use cases con puertos fake en memoria (sin red): flujos felices + los 7 tipos de error de la taxonomía, uno por tipo | `pytest` + fakes |
| Contrato de API | routers con `httpx.AsyncClient` + SQLite temporal + dependency_overrides de proveedores: paginación (sin duplicados con timestamps empatados), RFC 7807, 409/422/413/415 | `pytest-asyncio` |
| Adaptadores de proveedor | fixtures grabadas (httpx mock): timeout→reintento→504, 401→`PROVIDER_AUTH` sin reintentos, 429→backoff | `respx` |
| Ensamblaje | integración con ffmpeg real (clips sintéticos de 1 s generados por el propio test): concat + mezcla + música; marcado `slow` y excluido del ciclo rápido | `pytest -m slow` |
| Frontend unitarios | `ReferenceCard`/`AttributeRows` (render dinámico de atributos: ausente/null/desconocido), `SceneCard` memo, `ErrorNotice` por `code` | `vitest` + RTL |
| E2E | camino dorado UC-01→UC-09 con proveedores mockeados (opcional, recomendado antes de liberar) | `@playwright/test` |

Cómo reproducir la verificación cuando exista el código: `make test` (backend `pytest -m "not slow"`, frontend `vitest run`); `make test-slow` para ensamblaje; nada de esto ha corrido ahora — **verificación pendiente por diseño** (el enunciado pidió solo planificación).

---

## Anexo A — `config.yaml` completo (fuente única de límites)

```yaml
app:
  name: "AirShot"
  host: "127.0.0.1"
  port: 8000
  cors_origins: ["http://localhost:5173"]
  local_user_id: "local-user"          # usuario único v1 (hueco JWT en §1.10)
  max_body_bytes: 52428800             # 50 MiB: tope global de body (413); regla validada en arranque: ≥ max(upload.*)
  request_timeout_seconds: 300         # ops síncronas; regla validada en arranque: ≥ peor caso síncrono (timeout × (retries+1) + backoff)
  batch_max_operations: 8              # tamaño máx. de lote de generación por UI
  log_level: "INFO"

pagination:
  default_page_size: 25
  max_page_size: 100

story:
  max_title_length: 200
  max_original_story_length: 100000

scene:
  min_duration_seconds: 4              # LISTÓN: 4
  default_duration_seconds: 6          # LISTÓN: 6 por defecto
  max_duration_seconds: 15             # LISTÓN: 15
  max_scenes_per_project: 200          # R-08
  prompt_max_length: 2000

reference:
  max_images_per_reference: 6          # LISTÓN: máx. imágenes por personaje/escenario
  attributes_max_fields: 32
  attributes_max_depth: 2
  attributes_max_value_length: 200
  attributes_max_array_items: 8
  attributes_max_json_bytes: 16384
  sensitive_key_denied: ["apikey", "password", "secret", "token", "authorization", "privatekey"]
  max_name_length: 200                # límite de Reference.name (§2.3)
  max_description_length: 2000         # límite de Reference.description (§2.3)
  attributes_max_nested_fields: 8      # claves del objeto anidado (C-12)
  dangerous_key_denied: ["constructor", "prototype", "hasownproperty", "tostring", "valueof"]
  level_image_limits:                  # imágenes de referencia usadas por nivel (política §2.6)
    basic: 1
    advanced: 2
    cinematic: null                   # null = hasta el reference_image_limit del proveedor (R-03)

scene_reference:
  max_subjects_per_scene: 2
  max_environments_per_scene: 2

visual_style:
  max_description_length: 500          # límite de VisualStyle.description (§2.3)
  max_prompt_fragment_length: 1000    # límite de VisualStyle.promptFragmentEn (§2.3)

upload:
  image:
    max_bytes: 10485760                # 10 MiB
    allowed_mime: ["image/png", "image/jpeg", "image/webp"]
  music:
    max_bytes: 52428800               # 50 MiB
    allowed_mime: ["audio/mpeg", "audio/wav", "audio/ogg"]

assembly:
  ffmpeg_path: "ffmpeg"
  ffprobe_path: "ffprobe"
  job_timeout_seconds: 900
  require_audio: true                  # INV-09: si false, permite escenas sin narración
  video_codec: "libx264"
  video_crf: 23
  video_preset: "medium"
  output_fps: 24
  audio_sample_rate: 48000
  audio_channels: 2
  audio_bitrate_kbps: 192
  music_default_volume: 0.25
  music_fade_out_seconds: 2.0

storage:
  root: "./data"                       # uploads/ y outputs/ bajo la raíz (§3.5)

media:
  cache_max_age_seconds: 3600         # Cache-Control de /media (§3.5)

security:
  secret_key_env: "AIRSHOT_SECRET_KEY" # Fernet (ADR-012); la clave vive en .env, no versionada
  api_key_mask_visible_chars: 4        # INV-14: solo se muestran los últimos 4

audio_qa:
  earshot:
    enabled: false                     # ADR-013: módulo opcional, desactivado por defecto
    report_dir: "reports"               # relativo al proyecto en outputs/

providers:
  default_tts: "voicestudio"           # valor por defecto al crear proyecto (§2.3)
  default_llm: "openai_compat"         # resolución sin override (regla de §3.1.4)
  default_image: "openai_compat"      # ídem
```

Cada clave de **límite de negocio** aparece referenciada en la fase que la consume (mapa en §1.9); las claves de infraestructura (`host`, códecs, rutas de binarios, `log_level`, `cors_origins`) las consumen el arranque y los adaptadores (ADR-011). Cambiar un límite = editar este fichero y reiniciar (los CHECKs SQL no duplican ningún valor — §2.4). Reglas de coherencia validadas en arranque: `app.max_body_bytes ≥ max(upload.image.max_bytes, upload.music.max_bytes)`; `app.request_timeout_seconds ≥ (timeout síncrono del proveedor × (max_retries + 1) + backoff acumulado)`.

## Anexo B — `providers.yaml` (registro declarativo de proveedores)

```yaml
# Registro de integraciones ESTÁTICAS (sin secretos: las API keys viven cifradas en
# ProviderConfig, ADR-012). Añadir un proveedor nuevo = añadir una entrada aquí +
# su adaptador (§4.8 A). Los adaptadores implementan los puertos de F6 §6.4.
video:
  veo:
    adapter: "app.infrastructure.providers.veo.VeoVideoProvider"
    base_url: "https://generativelanguage.googleapis.com/v1beta"
    timeout_seconds: 300
    max_retries: 3
    backoff_base_seconds: 2.0
    max_concurrent: 2
    supported_durations: [4, 6, 8]     # A-02/A-04: verificar contra docs del proveedor
    reference_image_limit: 3           # R-03
  kling:
    adapter: "app.infrastructure.providers.kling.KlingVideoProvider"
    base_url: "https://api.klingai.com/v1"
    timeout_seconds: 300
    max_retries: 3
    backoff_base_seconds: 2.0
    max_concurrent: 1
    supported_durations: [5, 10]
    reference_image_limit: 1
  runway:
    adapter: "app.infrastructure.providers.runway.RunwayVideoProvider"
    base_url: "https://api.dev.runwayml.com/v1"
    timeout_seconds: 300
    max_retries: 3
    backoff_base_seconds: 2.0
    max_concurrent: 1
    supported_durations: []             # vacío = continuo dentro de [scene.min, scene.max]
    reference_image_limit: 1
  luma:
    adapter: "app.infrastructure.providers.luma.LumaVideoProvider"
    base_url: "https://api.lumalabs.ai/dream-machine/v1"
    timeout_seconds: 300
    max_retries: 3
    backoff_base_seconds: 2.0
    max_concurrent: 1
    supported_durations: []             # vacío = continuo dentro de [scene.min, scene.max] — A-02: verificar límites reales del proveedor
    reference_image_limit: 1
tts:
  voicestudio:                          # A-05: OpenAI-compatible local (default)
    adapter: "app.infrastructure.providers.voicestudio.VoiceStudioTTSProvider"
    base_url: "http://localhost:3900/v1"
    timeout_seconds: 60
    max_retries: 2
    backoff_base_seconds: 1.5
    max_concurrent: 2
    default_model: "default"
  elevenlabs:
    adapter: "app.infrastructure.providers.elevenlabs.ElevenLabsTTSProvider"
    base_url: "https://api.elevenlabs.io/v1"
    timeout_seconds: 60
    max_retries: 2
    backoff_base_seconds: 1.5
    max_concurrent: 2
llm:
  openai_compat:                        # A-01/A-10: endpoint OpenAI-compatible (Gemini u otro)
    adapter: "app.infrastructure.providers.llm_openai_compat.OpenAICompatLLMProvider"
    base_url: "https://api.openai.com/v1"   # el usuario pone el suyo en ProviderConfig.baseUrl
    timeout_seconds: 90                 # cabe en app.request_timeout_seconds con reintentos
    max_retries: 2
    backoff_base_seconds: 2.0
    max_concurrent: 1
image:
  openai_compat:
    adapter: "app.infrastructure.providers.image_openai_compat.OpenAICompatImageProvider"
    base_url: "https://api.openai.com/v1"
    timeout_seconds: 60                 # cabe en app.request_timeout_seconds con reintentos
    max_retries: 2
    backoff_base_seconds: 2.0
    max_concurrent: 1
audio_qa:
  earshot:                              # A-06/ADR-013
    adapter: "app.infrastructure.providers.earshot.EarshotAudioQAProvider"
    base_url: "http://localhost:3950"   # valor por defecto verificable; mecanismo de invocación (in-process vs HTTP) según supuesto A-06
    timeout_seconds: 300
    max_retries: 1
    backoff_base_seconds: 5.0
    max_concurrent: 1
```

`DurationMapper` (ADR-009): con `supported_durations` no vacío, la duración solicitada se redondea a la soportada más cercana (distancia absoluta mínima; empate → la menor); la UI advierte cuando la efectiva ≠ solicitada. Lista vacía = cualquier valor ya dentro de `[scene.min_duration_seconds, scene.max_duration_seconds]`.

## Anexo C — `schemas/reference-attributes.schema.json` (JSON Schema v1, draft-07)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://airshot.local/schemas/reference-attributes/v1",
  "title": "Reference attributes (v1)",
  "type": "object",
  "maxProperties": 32,
  "propertyNames": { "$ref": "#/definitions/safeKey" },
  "additionalProperties": {
    "oneOf": [
      { "type": ["string", "number", "boolean", "null"] },
      { "type": "array", "maxItems": 8,
        "items": { "type": ["string", "number", "boolean", "null"] } },
      { "type": "object",
        "maxProperties": 8,
        "propertyNames": { "$ref": "#/definitions/safeKey" },
        "additionalProperties": { "type": ["string", "number", "boolean", "null"] } }
    ]
  },
  "definitions": {
    "safeKey": {
      "pattern": "^[a-z][a-zA-Z0-9]{0,31}$",
      "not": { "enum": ["apikey", "password", "secret", "token", "authorization", "privatekey",
                        "constructor", "prototype", "hasownproperty", "tostring", "valueof"] }
    }
  }
}
```

Los límites dimensionales que JSON Schema no expresa de forma portable (bytes totales, profundidad total, longitud de cada string) los impone la pasada imperativa C-03/C-05/C-06 con valores de `config.yaml` (§4.2). El `maxProperties`/`maxItems` del schema se sincroniza con config en arranque (el validador toma siempre el mínimo de ambos — los valores del Anexo A/C coinciden deliberadamente 32/8, incluido el anidado 8 = `reference.attributes_max_nested_fields`). El conjunto de claves prohibidas efectivo es la **unión** de `sensitive_key_denied` y `dangerous_key_denied` (Anexo A) con el `enum` del schema, comparado en minúsculas (nunca la intersección); la comparación normalizada la ejecuta el validador. La protección real contra contaminación de prototipos es además estructural: la serialización JSON de Python no arrastra prototipos (defensa en profundidad declarada en §4.4).

## Anexo D — `styles.yaml` (semilla de estilos, extracto representativo)

```yaml
- name: "Cinematic teal-orange"
  promptFragmentEn: "cinematic lighting, teal and orange color grading, shallow depth of field"
- name: "Storybook illustration"
  promptFragmentEn: "warm storybook illustration, soft brush strokes, gentle pastel palette"
- name: "Noir comic"
  promptFragmentEn: "high-contrast noir comic style, ink shadows, dramatic framing"
```

(La semilla completa se define en implementación; el mecanismo — MERGE idempotente por `name` — está en §2.7. Este extracto existe para fijar el formato del dato, no para fingir completitud.)

## Estado de verificación (honestidad epistémica)

| Ítem | Estado | Cómo reproducir la verificación |
|---|---|---|
| Documento de arquitectura (este archivo) | **Generado** y revisado estáticamente por agentes árbitros independientes (rondas registradas en el «Informe del Árbitro» al final de este documento) | Leer `docs/architecture.md`; contrastar sección por sección contra el LISTÓN |
| ADRs `docs/decisions/` | **Generados** (15 ADRs + índice) | Leer `docs/decisions/README.md` y cada ADR |
| `agents.md` (registro de trabajo por fase) | **Generado** y actualizado al final de cada fase | Leer `agents.md` |
| Código backend/frontend | **No generado** (fase 6 esqueleto, por decisión del enunciado) | Al implementar: ejecutar §6.3; `make test` según §6.6 |
| Tests | **No ejecutados** (no hay código) | Al implementar: §6.6 |
| Compatibilidad real de APIs externas (Veo/Kling/VoiceStudio/Earshot) | **No verificada** — supuestos A-02/A-04/A-05/A-06 con método de verificación indicado | `POST /api/v1/provider-configs/{id}/test` + `GET /api/v1/health?deep=true` al implementar |
| Despliegue docker/make | **No ejecutado** (no hay código) | §6.3 al implementar |

---

## Informe del Árbitro

**Declaración de método**: todo el arbitraje fue **verificación estática de documentos** (Lectura de `docs/architecture.md`, `docs/decisions/` y `agents.md`). No se ejecutó código, tests, despliegues ni llamadas a APIs externas en ninguna ronda. Los árbitros fueron agentes independientes que no participaron en la construcción ni en las correcciones.

### Rondas del loop

El loop realizó **3 rondas**: ronda 1 (seis pasadas adversariales paralelas, una por fase), ronda 2 (pasada final sobre el LISTÓN completo) y ronda 3 (reverificación focalizada de las correcciones y veredicto final).

#### Ronda 1 — seis árbitros por fase

| Fase | Veredicto | Rechazo / defectos principales |
|---|---|---|
| F1 | Aprobada (condicionada) | 13 menores: componentes no canónicos en el mapa §0, fila «prompts en inglés» sin ADR, endpoint `GET /assemblies/{jobId}` citado sin fila en catálogo, `StoryboardService` sin anclaje en árbol, referencia colgante a «Informe del Árbitro», anglicismo «absent» |
| F2 | **Rechazada** | BLOQUEANTES: 4 límites sin clave de config (`Reference.name/description`, `VisualStyle.description/promptFragmentEn`); `Scene.voiceId` contratado en F3 pero no modelado (cadena de herencia imposible). Menores: pragma FK no documentado, puntero de política de `level` roto, cardinalidad ER, renombres sin nota, `createdAt` implícito |
| F3 | **Rechazada** | BLOQUEANTES: `voiceId` sin campo; `GET /api/v1/assemblies/{jobId}` ausente del catálogo (sondeo de jobs sin contrato). Menores: cursor de voces indefinido, códigos fuera de la tabla canónica (`LLM_INVALID_OUTPUT`, `REFERENCE_IMAGE_LIMIT`), 25/50 MiB contradictorios, `request_timeout` < timeouts síncronos de proveedores, ejemplos sin `PROVIDER_AUTH`/`INTERNAL_ERROR`/413, `GET /config` incompleto, upsert provider-configs sin semántica, sobrescritura de assets sin definir |
| F4 | Aprobada | 8 menores: `constructor`/`prototype` no bloqueados por el regex, comparación del denylist sin normalizar, `maxProperties` anidado sin clave, PATCH sin re-sello de versión, `attributes: []` sin fila, unidades de C-06, claves duplicadas, números no finitos |
| F5 | **Rechazada** | BLOQUEANTE: matriz de invalidación incompleta (música, audio-qa, DELETE escena/proyecto, PUT referencias, imágenes de referencia). Menores: cursor dentro de la clave de query, listados **P** sin `useInfiniteQuery`, sentinel sin clave, accesibilidad de virtualización, 4 organismos sin estados, `ReferenceRenderer` sin anclaje |
| F6 | **Rechazada** | BLOQUEANTES: mismos 4 límites sin config; contradicción interna `max_body_bytes` 25 MiB vs `music.max_bytes` 50 MiB. Menores: timeouts incoherentes, luma contradictorio, 8 componentes sin slot en el árbol, factories sin archivo, compose sin instalar dependencias, `VideoGenerationResult` ambiguo, `LLMProvider` sin `validate_config`, `Cache-Control` 3600 sin clave, claim «cada clave citada» falso |

**Correcciones aplicadas** (resumen; detalle completo en `agents.md`, tarea T9): claves nuevas en Anexo A; `Scene.voiceId`/`audioDurationSeconds` y `Project.musicOriginalName`/`musicDurationSeconds` modelados; `GET /assemblies/{jobId}` en catálogo; matriz de invalidación completada + regla general; `max_body_bytes` 50 MiB con reglas de coherencia; taxonomía ampliada; `GET /config` con enumeración cerrada; sortBy whitelists; ejemplos E-6/E-7/E-8; Anexo C con `definitions.safeKey` (unión config∪schema, minúsculas) y controles C-12/C-13; política de `level` con hogar único; PRAGMA FK documentado; nombres canónicos de componentes; árbol con raíz de repo + Dockerfile + factories; ADR-015 + índice; R-11 registrado; A-02 reescrito.

#### Ronda 2 — árbitro final (LISTÓN completo)

**RECHAZADO**. Puntos 1–6, 9 y 10: CUMPLE (verificados uno a uno con evidencia, confirmando las correcciones de la ronda 1). Fallaron: punto 7 (PARCIAL: «hasta 2» imágenes para `advanced` en §2.6 — límite de negocio sin clave de config) y punto 8 (NO CUMPLE: marcador residual `<!-- AIRSHOT-CONTINUA -->` + líneas en blanco al final del documento). Tres menores: tabla «Escenas» partida, `GET /config` sin excluir storage/security del claim «grupos del Anexo A», entrada T9 de `agents.md` fuera del worklog.

#### Ronda 3 — reverificación y veredicto final

**APROBADO.** Los 5 defectos corregidos sin regresiones: `reference.level_image_limits {basic: 1, advanced: 2, cinematic: null}` en Anexo A y citado en §2.6 (fórmula de tope efectivo actualizada); tabla «Escenas» fusionada; `GET /config` reformulado; marcador residual y líneas en blanco eliminados; `agents.md` reestructurado. Sin defectos nuevos bloqueantes.

### LISTÓN — verificación final (ronda 3)

| # | Punto | Verificación |
|---|---|---|
| 1 | Cada requisito funcional mapeado a fase/módulo/decisión | **Verificado** (§0: 12 filas + transversales; fila de prompts con ADR-015; todos los endpoints citados existen en el catálogo) |
| 2 | Nuevo proveedor de video sin tocar el núcleo (Controller → Factory/Strategy → VideoProvider → Output) | **Verificado** (§4.8 A + ADR-007 + Anexo B) |
| 3 | Nuevo atributo de referencia sin esquema relacional ni núcleo (JSONB + ReferenceRenderer dinámico) | **Verificado** (§4.2–4.8 + ADR-003 + Anexo C) |
| 4 | Paginación por cursor en TODO listado | **Verificado** (7/7 listados **P**; repos solo vía `list_page(spec)`; recuento explícito en §3.2) |
| 5 | Virtualización + claves estables UUID, nunca índice | **Verificado** (§5.1–5.3) |
| 6 | Siete tipos de error distinguidos explícitamente | **Verificado** (tabla canónica §3.1.1 aplicada en §2.3, §4.6, §5.4) |
| 7 | Cero hardcoding | **Verificado** (todo límite con clave en Anexo A/B; constantes técnicas whitelist en §1.9; reglas de coherencia en arranque) |
| 8 | Sin placeholders/TODO/marcadores/textos sin propósito | **Verificado** (barridos globales negativos; EOF limpio) |
| 9 | Ninguna afirmación de ejecución no reproducible | **Verificado** (barrido global negativo; instrucciones futuras reproducibles) |
| 10 | Derivados: extensibilidad demostrable, escalabilidad, anti-sobreingeniería, honestidad | **Verificado** (§4.8 end-to-end; §1.8; «Estado de verificación» + supuestos A-01..A-12) |

### Qué NO pudo verificarse (y cómo reproducirlo)

La verificación fue **estática de documento**: no existe código de AirShot (por decisión del enunciado, la Fase 6 es esqueleto). Queda pendiente de verificación dinámica, al implementar:

| Pendiente | Cómo reproducirlo |
|---|---|
| Compatibilidad real de Veo/Kling (duraciones), VoiceStudio (endpoints) y Earshot (contrato) | `POST /api/v1/provider-configs/{id}/test` + `GET /api/v1/health?deep=true` (supuestos A-02/A-04/A-05/A-06) |
| Ejecución de tests de contrato, adaptadores y ensamblaje | `make test` y `make test-slow` según §6.6 |
| Arranque con `config.yaml`/`providers.yaml` (reglas de coherencia, Pydantic Settings) | Ejecutar §6.3 y observar el arranque |
| Comportamiento de paginación/virtualización/memo bajo carga real | Tests de contrato (sin duplicados con timestamps empatados) + e2e Playwright + React DevTools sobre storyboard >50 escenas |
| Comandos de instalación/despliegue (venv, alembic, uvicorn, vite, docker compose) | Ejecutar §6.3 en entorno limpio |

Ninguno de los puntos anteriores fue afirmado como ejecutado; todos están declarados como pendientes con su método de reproducción.
