# ADR-015 — Idioma de los prompts visuales: inglés (historia y UI en español)

**Contexto.** El enunciado exige: «los prompts se generan en inglés (mejor rendimiento en modelos de imagen/video); la UI y los textos visibles al usuario están en español». La decisión afecta al núcleo (`PromptComposer`, INV-13, validación de `promptEn`) y era la única fila del mapa de trazabilidad §0 sin ADR asignado.

**Decisión.**

1. `promptEn` y los fragmentos de estilo (`VisualStyle.promptFragmentEn`) se generan y editan SIEMPRE en inglés; INV-13 (F2 §2.4) valida ASCII imprimible + puntuación común en `promptEn`.
2. La historia original y mejorada (`originalStory`/`improvedStory`/`improvedText`) y toda la UI permanecen en español; el LLM del storyboard produce `promptEn` en inglés como parte de su salida estructurada.
3. Los atributos de referencias pueden llegar en español (p. ej. `hairColor: "castaño"`): `PromptComposer` los incorpora tal cual — los valores libres no se traducen automáticamente (se declara; la traducción de valores es una extensión futura con ADR propio si se demuestra degradación).
4. El frontend no valida el idioma de `promptEn` (validación de backend como única fuente); el editor muestra una nota de convención.

**Coste asumido.** El usuario bilingüe pasivo debe poder leer prompts en inglés (aceptado por el enunciado). No se afirma mejora cuantitativa: es una expectativa cualitativa documentada como supuesto A-03 con verificación diferida.

**Alternativas descartadas.**

- Prompts en español: degradación esperada de calidad en los modelos de imagen/video actuales (según el propio enunciado).
- Doble idioma con selector: duplicación de prompts por escena sin requisito real; complejidad de sincronización.
- Traducción automática de atributos en el pipeline: dependencia extra y pérdida de control del usuario sobre el prompt final.

**Relación.** §0 fila 5; §1.7; INV-13; supuesto A-03; `StoryboardService` (salida estructurada del LLM).
