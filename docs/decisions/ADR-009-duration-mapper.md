# ADR-009 — DurationMapper por proveedor

**Contexto.** El usuario configura escenas de 4–15 s (default 6). Los proveedores soportan duraciones discretas distintas (Veo {4,6,8}; Kling {5,10}; otros continuos). Riesgo R-02 del F1.

**Decisión.**

1. Cada entrada de `providers.yaml` declara `supported_durations: [int]` (lista vacía = cualquier valor ya válido dentro de `[scene.min_duration_seconds, scene.max_duration_seconds]` de `config.yaml`).
2. `DurationMapper` (servicio de dominio puro) mapea la duración solicitada a la soportada más cercana por distancia absoluta; en empate elige la menor. Ejemplos con los defaults del Anexo B: 6 s → Veo 6; Kling 5; 9 s → Veo 8; Kling 10.
3. El resultado efectivo se advierte en la UI (badge «efectiva 5 s» cuando difiere de la solicitada) y se persiste en el resultado de la generación (`effectiveDurationSeconds` del puerto `VideoProvider`).
4. El ensamblaje usa la duración **efectiva** de cada clip (la del archivo real), no la solicitada — la sincronización de narración se calcula contra el clip real.

**Coste asumido.** Desviación visible de segundos entre lo pedido y lo obtenible (inherente al proveedor; se muestra, no se oculta).

**Alternativas descartadas.**

- Rechazar duraciones no soportadas: rompe el flujo del usuario y obligaría a editarlo escena por escena por proveedor.
- Redondeo siempre hacia arriba: despilfarra coste de generación; hacia abajo: siempre pierde narración; la distancia mínima es la política menos sesgada y más predecible.
- Delegar el mapeo a cada adaptador sin servicio común: duplicaría una regla de negocio en N adaptadores (rompe «una regla, un lugar»).

**Relación.** R-02/F1; `capabilities()` del puerto `VideoProvider` expone `supported_durations` (F6 §6.4); tabla de casos de prueba prevista en §6.6.
