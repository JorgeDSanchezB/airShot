# ADR-001 — SQLite + SQLAlchemy 2.0 async + repositorios + Alembic

**Contexto.** AirShot v1 es una herramienta local single-user. El enunciado exige SQLite para la versión local y que el acceso a datos esté abstraído (repositorios) para migrar a PostgreSQL sin tocar el dominio.

**Decisión.**

1. SQLite como motor v1, accedido con SQLAlchemy 2.0 async (`aiosqlite`) — async necesario porque los use cases llaman a proveedores lentos sin bloquear.
2. Acceso a datos exclusivamente vía repositorios (puertos en `app/domain/ports/repositories.py`, implementación SQLAlchemy en `app/infrastructure/persistence/repos/`). Los use cases jamás importan SQLAlchemy.
3. Alembic como gestor de migraciones con baseline único y revisiones generadas contra los modelos; seeds de estilos como migración de datos idempotente.
4. Columnas JSONB con `sa.JSON().with_variant(postgresql.JSONB, "postgresql")` para que el mismo modelo sirva a SQLite (TEXT-JSON) y PostgreSQL (JSONB nativo) sin cambiar dominio.
5. SQLite solo impone FKs si el engine activa `PRAGMA foreign_keys=ON` por conexión: se configura como event listener del engine en `database.py` (así INV-01/INV-04 y los CASCADE son reales, no decorativos).

**Coste asumido.** Boilerplate de repos (7 interfaces + 7 implementaciones — una por entidad del modelo F2) y ceremony Alembic frente a `create_all`.

**Alternativas descartadas.**

- PostgreSQL en v1: servidor innecesario para single-user local; el enunciado lo reserva como migración y este diseño la deja como cambio de driver + revisión Alembic.
- SQLModel: mezcla modelo ORM y esquema Pydantic en una sola clase — acopla persistencia al contrato HTTP y su soporte async/JSONB es menos maduro que SQLAlchemy 2.0 puro.
- `create_all` sin Alembic: sin historial ni ruta de evolución (rompe la exigencia de migrar sin reescribir).
- Prisma u otros ORMs no-Python: fuera del stack obligatorio (Python 3.11+ / FastAPI).

**Relación.** Soporta INV-01..INV-14 (F2 §2.4) y el requisito multi-tenant (§1.10: `tenant_id` futuro = columna + filtro en repos, cambio aditivo).
