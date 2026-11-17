# ADR-005 — Paginación por cursor (createdAt+id; orderIndex en escenas)

**Contexto.** El LISTÓN («regla de la Lista Infinita») exige que todo endpoint de listado funcione con 10, 100, 1.000 o 1.000.000 de elementos, con paginación por cursor, y prohíbe `SELECT *` sin filtros ni paginación.

**Decisión.**

1. Todos los listados del contrato v1 (F3 §3.2, con recuento explícito) aceptan `?limit=&cursor=` y devuelven la envolvente `{items, nextCursor, limit}`.
2. Cursor opaco = clave de ordenación compuesta + desempate por `id` (UUID): `(created_at, id)` en colecciones generales; `orderIndex` en escenas dentro de proyecto (único por proyecto por INV-02, sin desempate).
3. Predicado SQL expandido portable: `(created_at < :c) OR (created_at = :c AND id < :i)` — evita depender de comparación de tuplas y funciona en SQLite y PostgreSQL.
4. `limit` con default/max desde `config.yaml` (`pagination.*`); fuera de rango → 422 (nunca recorte silencioso).
5. Sin `total`/`COUNT(*)` en las páginas: coste O(n) en toda la tabla por petición; la UI usa «cargar más».
6. Índices compuestos exactos por consulta (F2 §2.7) para que cada página sea O(limit) por seek, no por scan+skip.

**Coste asumido.** El cursor es opaco (el cliente no puede saltar a una página arbitraria ni ordenar por columnas no whitelistadas); sorts arbitrarios quedan fuera del contrato v1 y se declaran como extensión futura con su clave compuesta propia.

**Alternativas descartadas.**

- `OFFSET/LIMIT`: degradación O(n) al profundizar (offset alto = recorrer y descartar) y duplicados/pérdidas con inserciones concurrentes — exactamente lo que la regla prohíbe.
- Paginación por número de página: requiere COUNT o estado de servidor; mismo problema de estabilidad.
- Keyset «puro» exponiendo timestamps en la URL: acopla el contrato al detalle físico de ordenación y filtra el mismo segundo con imprecisiones; el cursor opaco encapsula la clave.

**Relación.** F3 §3.1.3 (contrato completo y límites prácticos declarados), F5 §5.3 (virtualización alimentada por `useInfiniteQuery`).
