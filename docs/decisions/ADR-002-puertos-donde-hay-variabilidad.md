# ADR-002 — Puertos y adaptadores solo donde hay variabilidad real

**Contexto.** El enunciado exige intercambiabilidad de: proveedores de video, TTS, (añadidos por requisito funcional: LLM, image-gen, QA de audio), almacenamiento de archivos y mecanismo de ensamblaje. Y prevé migraciones SQLite→PostgreSQL y FS→S3.

**Decisión.** Arquitectura en capas simplificada (presentación, aplicación, dominio, infraestructura) con **puertos (interfaces de dominio) únicamente en los ejes con variabilidad real o migración prevista**: `VideoProvider`, `TTSProvider`, `LLMProvider`, `ImageProvider`, `AudioQAProvider`, `StorageService`, `AssemblyService` y repositorios. El resto del dominio (servicios puros, entidades, enums) no envuelve nada adicional.

**Coste asumido.** Indirección: composition root en `app/main.py`, inyección de dependencias y una capa más de archivos frente a un CRUD directo.

**Alternativas descartadas.**

- Hexagonal estricto con capa anti-corrupción por proveedor: no hay modelos de dominio externos que traducir (los payloads de Veo/Kling/ElevenLabs se traducen a DTOs de puerto de una vez); el coste de una ACL formal no lo paga nadie en single-user local.
- «Big ball of mud» con SDKs importados en use cases: viola la intercambiabilidad exigida (cada cambio de API de proveedor tocaría el núcleo).
- Microservicios por proveedor: coste operativo (despliegue, red, observabilidad) sin ningún requisito de escala que lo pida.

**Relación.** Base del ejemplo de extensibilidad §4.8 A (ProviderX sin tocar núcleo) y de las migraciones previstas (ADR-001, ADR-011).
