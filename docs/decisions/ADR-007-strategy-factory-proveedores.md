# ADR-007 — Strategy + Factory con registro declarativo `providers.yaml`

**Contexto.** El enunciado exige proveedores de video intercambiables (Veo, Kling, Runway, Luma…) y TTS (VoiceStudio, ElevenLabs). El LISTÓN exige que añadir un proveedor nuevo no modifique el núcleo, mostrando el flujo Controller → Factory/Strategy → Provider → Output.

**Decisión.**

1. Puertos de dominio por familia (`VideoProvider`, `TTSProvider`, `LLMProvider`, `ImageProvider`, `AudioQAProvider` — F6 §6.4).
2. Factories de infraestructura que resuelven `providerName → adapter` leyendo el **registro declarativo** `providers.yaml` (Anexo B): ruta del adaptador, `base_url` por defecto, timeouts/reintentos/backoff/concurrencia, `supported_durations`, `reference_image_limit`.
3. Los secretos NO viven en el registro: se cifran en `ProviderConfig` (ADR-012); el factory compone registro + configuración del usuario al instanciar.
4. Registro + entrada = proveedor nuevo operativo (flujo §4.8 A). El núcleo (Scene, use cases, controllers) desconoce la existencia de proveedores concretos.

**Coste asumido.** Un fichero de registro que mantener coherente con los adaptadores existentes (validado en arranque: entrada sin adaptador importable → error de configuración ruidoso, no silencioso).

**Alternativas descartadas.**

- `if/elif` por proveedor en los use cases: cada proveedor nuevo toca el núcleo y sus tests — el defecto exacto que el LISTÓN usa como contraejemplo.
- Plugin discovery automático por convención de nombres (importlib.scan): mágico, difícil de auditar; el registro explícito es verificable por lectura.
- Registro en BD: mezcla configuración de integración (estática, versionada) con secretos (dinámicos) — el split registro/BD es deliberado.
- Inyección de SDKs como dependencias concretas en cada endpoint: acoplamiento total.

**Relación.** Motor de §4.8 A; semáforos de concurrencia por proveedor (F3 §3.1.4); `DurationMapper` se alimenta de `supported_durations` del registro (ADR-009).
