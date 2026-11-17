# ADR-008 — Frontend: Vite SPA + shadcn/ui + Zustand + TanStack Query + react-virtual

**Contexto.** Enunciado fija React 18 + TypeScript + Vite + librería de componentes (shadcn/ui o Radix + Tailwind), Zustand para estado y @tanstack/react-virtual para listas. El LISTÓN exige virtualización y claves estables.

**Decisión.**

1. SPA con Vite y react-router-dom (tres páginas: `ProjectsPage`, `ProjectWorkspacePage` con pestañas, `SettingsPage`). Sin SSR: es un cliente local contra una API propia; nada lo necesita.
2. Componentes shadcn/ui (Radix+Tailwind) con organizaciones Átomos→Moléculas→Organismos→Páginas (F1 §1.5).
3. División estricta de estado (F1 §1.6): servidor → TanStack Query (claves canónicas e invalidación por mutación, F5 §5.2); UI efímera → Zustand. Regla: nada de servidor en Zustand y viceversa.
4. `@tanstack/react-virtual` por encima del umbral de virtualización (constante de rendimiento UI documentada) con `getItemKey` = UUID (F5 §5.3).
5. Límites de negocio leídos de `GET /api/v1/config` (cero duplicación de constantes de negocio en el cliente).

**Coste asumido.** Dos librerías de estado con frontera disciplinada; caché de cliente que crece con las páginas cargadas (mitigado con `gcTime`); bundle con Radix.

**Alternativas descartadas.**

- Next.js/SSR: no hay SEO ni primera carga crítica que lo justifique y añade un runtime de servidor para una herramienta local.
- Redux Toolkit (o RTK Query): boilerplate de stores/actions sin ningún requisito de depuración temporal o middleware complejo.
- Context API para estado global: re-renders en cascada que arruinan las listas virtualizadas.
- SWR: viable, pero la combinación `useInfiniteQuery` + invalidación encadenada de AirShot está mejor cubierta por TanStack Query (y ya es la elección del enunciado implícito).
- Renderizar listas completas sin virtualizador: DOM inviable con miles de escenas.

**Relación.** F5 completo; `reference-attributes.display.ts` como registro de presentación (§4.7).
