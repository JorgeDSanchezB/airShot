# ADR-006 — Taxonomía de 7 tipos de error + RFC 7807

**Contexto.** El LISTÓN exige distinguir explícitamente, en cada decisión de tolerancia a fallos: campo opcional ausente, valor nulo, dato inválido, error temporal (timeout de proveedor), error de autorización (API key inválida), error de configuración (proveedor no configurado) y fallo crítico. Y prohíbe ocultar errores con valores por defecto silenciosos.

**Decisión.**

1. Tabla canónica única (F3 §3.1.1) que define los 7 tipos + complementarios (404, estado inválido, 413, 415), con su tratamiento, HTTP, `code` y política de reintento. Todas las demás fases la aplican y la referencian (F2 §2.3 semántica de null por campo; F4 §4.6; F5 §5.4).
2. Toda respuesta de error es RFC 7807 (Problem Details) con extensiones: `code`, `traceId`, `retryable`, y contexto (`provider`, `sceneId`, `field`, `hints[]` accionables).
3. Reglas anti-ocultamiento: `extra="forbid"` en DTOs (campo desconocido → 422 `UNEXPECTED_FIELD`, nunca descarte), nulos explícitos rechazados en campos no-nullable, sin catches vacíos, sin fallback silencioso entre proveedores, sin conversión de errores a defaults.
4. Fail fast de configuración: `PROVIDER_NOT_CONFIGURED` (409) se detecta antes de llamar al proveedor.
5. `lastError`/`errorMessage` persisten snapshots RFC 7807 en escenas/jobs para reproducibilidad del diagnóstico.

**Coste asumido.** Mantener la tabla como fuente única y disciplinar cada endpoint nuevo a mapear sus errores a `code`s existentes (o ampliar la tabla en un ADR); payload de error más verboso.

**Alternativas descartadas.**

- Excepciones con `str(e)` plano: pierde la clasificación, imposible de reintentar o remediar en UI.
- Códigos por endpoint ad hoc: inconsistencia y estados imposibles de testear sistemáticamente.
- Envolventes de error propietarias: RFC 7807 ya es el estándar (soporte nativo de FastAPI vía `HTTPException` custom + handlers); inventar otra no aporta.

**Relación.** F3 §3.1.1 (tabla), F4 §4.2 (códigos por control de validador), F5 §5.5 (mapeo a mensajes accionables).
