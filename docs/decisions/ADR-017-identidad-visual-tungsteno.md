# ADR-017 — Identidad visual «tungsteno» para el frontend

**Estado**: aceptado · **Fecha**: 2026-11-18 · **Contexto**: T17 (rediseño visual solicitado por el usuario con estándar Awwwards)

## Decisión

Sistema de diseño cinematográfico «tungsteno» para toda la UI:

- **Paleta**: superficie «papel fotográfico» cálido en light (oklch 0.972/0.009/92) y «sala de proyección» en dark (oklch 0.156/0.009/58); acento único ámbar-naranja (light oklch 0.63 0.198 47, dark oklch 0.76 0.165 62). Sin azules ni índigos (regla de estilo del entorno). Verde emerald reservado exclusivamente a semántica de estado de éxito.
- **Tipografía**: Bricolage Grotesque (display: marca, títulos), Instrument Serif itálica (máx. 1 acento decorativo por vista, siempre `text-primary`), Geist + Geist Mono (body y metadatos técnicos con clase `.slug` tabular-nums).
- **Textura y motion**: grano de película fijo (SVG feTurbulence, `--grain-opacity` por modo), nav pill deslizante (`layoutId`), transiciones de vista fade-rise, elevación de tarjetas (`--elevate` cálido), marquee de métricas runtime (pausa hover, `prefers-reduced-motion` anulado).
- **Momento firma**: monitor de proyección en el hero — REC pulsante, timecode vivo a 24fps (interval 41.7ms), playhead sobre tira de segmentos cuya cantidad refleja `sceneCount` real del primer proyecto. SSR-safe (frame inicial 0 → «00:00:00:00» idéntico server/cliente).
- **Hidratación**: `useSyncExternalStore` para `useIsHydrated` en el toggle de tema (patrón canónico; el setState síncrono en efecto lo prohíbe el React Compiler del lint).

## Alternativas descartadas

1. **Mantener shadcn por defecto** — cero identidad; descartado por exigencia del usuario.
2. **Dark cinematográfico solamente** — la app define `defaultTheme="light"` y ambos modos deben respirar la marca; se diseñaron los dos con el mismo sistema de tokens.
3. **Vídeo real de fondo en el hero** — coste de assets locales y ruido de decodificación; el monitor simulado comunica el concepto con 0 peticiones.
4. **WebGL/canvas para el monitor** — sobre-ingeniería para un elemento decorativo; CSS + interval es suficiente y respeta reduced-motion.

## Consecuencias

- **Positivas**: identidad diferenciada y coherente (jurado VLM: «genuinamente autoría, no plantilla», 8.4/10); cero cambios de lógica (los subagentes de estilado solo tocaron presentación); AA mejorado en texto secundario (`--muted-foreground` recalculado).
- **Negativas/riesgos**: oklch con hue cálido requiere navegadores modernos (aceptado: objetivo local moderno); el grano fijo añade un layer compositing (opacity ≤0.08, impacto despreciable); el contador de segmentos del monitor depende de `projects[0]` (solo presentación, decae a 6 si no hay proyectos).
- **Validación**: E2E agent-browser (hidratación limpia, tabs, ambos temas) + auditoría adversarial VLM en 2 rondas con corrección de 14 defectos documentados en agents.md/T17.
