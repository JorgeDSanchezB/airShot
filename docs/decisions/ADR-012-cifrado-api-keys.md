# ADR-012 — Cifrado Fernet de API keys en BD y secretos por entorno

**Contexto.** El usuario introduce sus API keys de proveedores por la UI. Deben persistir (persistencia de configuración) pero no pueden quedar en claro ni en ficheros versionados.

**Decisión.**

1. `ProviderConfig.apiKeyEncrypted` almacena ciphertext Fernet (simétrico, autenticado). La clave maestra vive SOLO en la variable de entorno `AIRSHOT_SECRET_KEY` (referenciada por `security.secret_key_env` en `config.yaml`); nunca en ficheros versionados ni logs.
2. La API nunca devuelve la clave: `GET /provider-configs` responde con `apiKeyMasked` (últimos N caracteres de `security.api_key_mask_visible_chars`) + indicador de «configurada/no configurada» (INV-14). `PATCH` la acepta write-only.
3. Al usar un proveedor: ausencia de key o de ProviderConfig activo → 409 `PROVIDER_NOT_CONFIGURED` (fail fast); key presente pero rechazada por el proveedor → 502 `PROVIDER_AUTH` con remediación y `lastCheck` persistido (ADR-006: nunca fallback silencioso).
4. `providers.yaml` y `config.yaml` versionados NO contienen secretos (Anexo A/B lo cumplen).

**Coste asumido.** Una clave maestra de entorno que el usuario debe provisionar (documentada en §6.3: `.env`); rotación manual (re-cifrar) no automatizada en v1 — declarado como limitación.

**Alternativas descartadas.**

- Claves en `config.yaml`: fugas por VCS — inaceptable.
- Claves en claro en BD «porque es local»: el enunciado pide `(apiKey (encriptada))`; además el dump de la BD quedaría comprometido.
- KMS externo: no existe KMS local en el stack; coste y dependencia sin beneficio en single-user.
- Hash de la clave: hay que USARLA (enviarla al proveedor), no solo verificarla; hash no sirve.

**Relación.** R-09 del F1; INV-14; taxonomía §3.1.1 (auth vs configuración); `POST /provider-configs/{id}/test`.
