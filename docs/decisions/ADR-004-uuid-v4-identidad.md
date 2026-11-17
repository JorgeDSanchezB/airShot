# ADR-004 — UUID v4 como identidad de todas las entidades

**Contexto.** El LISTÓN exige claves estables en el frontend («nunca el índice»). Las listas de AirShot son editables: reordenar escenas (`PUT /scenes/order`), borrar intermedios y fusionar bibliotecas (global+proyecto) son operaciones normales.

**Decisión.** Todas las entidades implementan `IEntity` con `id: UUID` (uuid4) generado en el dominio, persistido como `TEXT(36)` en SQLite. Ni el frontend ni la BD generan identidad.

**Coste asumido.** Índices con insert order aleatorio (fragmentación de B-tree) y 36 bytes por clave frente a 8 de un entero. En SQLite local con decenas de miles de filas es irrelevante y medible en implementación; si creciera, la migración a PostgreSQL con `uuid` nativo no cambia el dominio.

**Alternativas descartadas.**

- `INTEGER PRIMARY KEY AUTOINCREMENT`: keys de React inestables en listas editables (el índice reutiliza nodos con datos cruzados — exactamente el defecto que el LISTÓN prohíbe); colisiona al fusionar entornos multi-tenant futuros.
- ULID/UUIDv7 (ordenado): resolvería la fragmentación, pero añade una dependencia y un formato no estándar en Python stdlib sin requisito actual; se reevalúa si se migra a PostgreSQL con alto volumen.

**Relación.** Sostiene F5 §5.1 p.1 (keys UUID), el desempate de cursor `(createdAt, id)` (ADR-005) y `getItemKey` del virtualizador (F5 §5.3).
