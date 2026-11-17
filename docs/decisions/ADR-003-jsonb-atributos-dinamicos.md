# ADR-003 — Atributos dinámicos en JSONB + JSON Schema (no EAV, no columnas)

**Contexto.** El LISTÓN exige que añadir un atributo a una referencia (p. ej. `hairColor`) no modifique el esquema relacional ni el núcleo. La entidad `Reference` del enunciado ya declara `attributes: JSONB` y `referenceImages: JSONB`.

**Decisión.**

1. `attributes` y `referenceImages` como columnas JSONB (`sa.JSON` con variante PostgreSQL; TEXT-JSON en SQLite), con validación de contenido en cada escritura.
2. Validación en dos pasadas (F4 §4.2): JSON Schema versionado (Anexo C) para forma (tipos, nombres, denylis sensible) + pasada imperativa para bytes totales, profundidad y longitudes (restricciones que JSON Schema draft-07 no expresa de forma portable).
3. Sello `attributesSchemaVersion` por fila; política de versionado aditiva (§4.5).
4. Sin índices sobre atributos en v1 porque **no existe requisito de filtrar por atributo** (los listados filtran por columnas: nombre/tipo/level/scope).

**Coste asumido.** (a) lectura de la referencia completa para ver atributos (decenas-cientos de filas: irrelevante); (b) validación imperativa (~40 líneas); (c) imposibilidad de CHECK por atributo en BD (mitigada por el validador de aplicación).

**Alternativas descartadas.**

- EAV: consultable por atributo, pero añade N filas por referencia, reconstrucción de objeto en lectura, riesgo N+1 y complejidad de integridad — no hay ningún requisito de consulta por atributo que lo pague.
- Columnas fijas: añadir `hairColor` exigiría `ALTER TABLE` — viola frontalmente la regla del enunciado.
- Tabla de atributos tipada (key/value/typed-value): EAV con pasos extra; mismo descarte.

**Relación.** Motor del ejemplo §4.8 B y del `ReferenceRenderer` dinámico (F5 §5.4). Justificación comparativa completa en F2 §2.5.
