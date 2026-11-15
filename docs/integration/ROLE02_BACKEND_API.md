# Contrato público del backend (Rol 02 → Rol 01)

Estado: **probado contra PostgreSQL con las migraciones reales, no contra un proyecto Supabase desplegado**
(ver `supabase/README.md`). Esto es lo **implementado**; se alineó con `SupabaseMissionGateway` y con
`docs/integration/SUPABASE_EDGE_FUNCTION_SPEC.md` de la rama `feat/multiplayer-p0-fixes`. Las diferencias con esa
especificación están en la sección 9.

## 1. Sesión

El jugador entra con sesión anónima: `supabase.auth.signInAnonymously()` (`ensureAnonymousUser`). Todas las
llamadas llevan `Authorization: Bearer <access_token>`; `supabase-js` lo añade solo. La clave publicable sin sesión
**no** sirve. La clave `service_role` no existe en el navegador.

## 2. Operaciones

| Operación | Cómo se llama | Quién escribe |
|---|---|---|
| Crear sala | `functions.invoke('create_room')` | Edge Function |
| Unirse | `rpc('join_room', { p_join_code })` | RPC con `auth.uid()` |
| Acción de juego | `functions.invoke('dispatch_action')` | Edge Function |
| Leer estado | `from('mission_state').select('snapshot,revision').eq('room_id', id).single()` | solo lectura (RLS) |
| Cambios en vivo | Realtime `postgres_changes` de `mission_state` (y `mission_events`) | — |
| Informe y puntaje | `from('mission_reports').select('*').eq('room_id', id)` | solo lectura (RLS) |

### `create_room`

Cuerpo: `{ "scenarioId": "A1" | "A2", "ownerRole"?: "ground" | "satellite" }`. `preferredRole` es sinónimo de
`ownerRole`; si llegan los dos deben coincidir. Por defecto `ground`. No se admiten más campos.

Respuesta 200: `{ "roomId": "<uuid>", "joinCode": "K7M2QX", "role": "ground", "revision": 0 }`.
El código tiene 6 caracteres de `A-H J K M N P-Z 2-9`; se escribe sin distinguir mayúsculas.

### `join_room(p_join_code text)` → `jsonb`

| `status` | Significado | Otros campos |
|---|---|---|
| `joined` | Entraste con el rol libre | `roomId`, `role` |
| `already_member` | Ya estabas en la sala (reconexión) | `roomId`, `role` |
| `room_full` | Ya hay un `ground` y un `satellite` | — |
| `room_not_found` | Código inexistente | — |
| `rate_limited` | 10 códigos fallidos en 10 minutos | — |
| `retry` | Dos personas entraron a la vez; repetir la llamada | — |

Sin sesión lanza `not_authenticated`. El rol lo asigna el servidor.

## 3. `dispatch_action`

Cuerpo: `{ "roomId": "<uuid>", "action": MissionAction }`, con la acción exacta del contrato v3
(`actionId`, `actorRole`, `expectedRevision`, `type`, `payload`). Se tolera un `expectedRevision` repetido fuera de la
acción (como lo envía el gateway) si coincide con el de la acción. Se rechazan los campos extra (en la acción y en el
`payload`), el formato plano del Documento Maestro y los textos fuera de `[A-Za-z0-9._:-]{1,100}`
(`reportId` admite además espacios). Cuerpo máximo: 4096 caracteres.

`actorRole` **no autoriza nada**: el servidor lo compara con la membresía del JWT.

### Formato de la respuesta

`supabase.functions.invoke` **oculta el cuerpo de cualquier respuesta no 2xx** (solo entrega un `error` genérico). Por
eso hay dos tipos de respuesta:

**Resultado de juego → siempre HTTP 200 y con `ok`:**

```jsonc
// aceptada (también el reintento de una acción ya aceptada, con "duplicate": true)
{ "ok": true, "change": { "eventId": "<actionId>", "actionId": "<actionId>", "snapshot": { /* MissionSnapshot */ } } }

// no aplicada, pero no es un fallo de red
{ "ok": false, "code": "WRONG_ROLE", "message": "texto en español para la UI", "revision": 3 }
```

| `code` (con `ok: false`) | Cuándo | Campos extra | `MissionErrorCode` que usa el gateway hoy |
|---|---|---|---|
| código de regla (`WRONG_ROLE`, `INVALID_EVIDENCE`, `INSUFFICIENT_ENERGY`, `WRONG_PHASE`, …) | Lo deniega el motor (los `DenialCode` de `src/missions/flood/types.ts`) | `revision`, `duplicate?` | `INVALID_ACTION` con `message` |
| `STALE_REVISION` | `expectedRevision` viejo o carrera entre dos acciones | `revision`, `snapshot` vigente | `REVISION_CONFLICT` |
| `duplicate` | Mismo `actionId` con otro contenido u otro usuario (no trae `change`) | — | `DUPLICATE_ACTION` |

**Fallo de protocolo → HTTP 4xx/5xx, también con `{ ok: false, code, message }`:**

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `INVALID_ACTION` | Cuerpo o acción mal formados |
| 401 | `NOT_AUTHENTICATED` | Sin sesión o JWT inválido |
| 403 | `NOT_AUTHORIZED` | No eres miembro (o la sala no existe: misma respuesta) o `actorRole` ≠ tu rol |
| 405 | `METHOD_NOT_ALLOWED` | No es POST |
| 413 | `PAYLOAD_TOO_LARGE` | Cuerpo > 4096 caracteres |
| 429 | `RATE_LIMITED` | Demasiadas salas o intentos denegados |
| 500 | `TRANSPORT_ERROR` | Fallo interno: **reintentar con el mismo `actionId`** |

## 4. Idempotencia y concurrencia

- El `actionId` se genera **una vez** por intención y se reutiliza en todos los reintentos de red.
- Mismo `actionId` y mismo contenido: no se aplica ni se cobra otra vez.
  - Si se aceptó: `ok: true`, `duplicate: true` y el **snapshot vigente** (puede ser más nuevo que el original; el
    cliente se queda con la revisión mayor. No se fabrica un snapshot histórico).
  - Si se denegó: la misma respuesta `ok: false`, con `duplicate: true`.
- El reintento se resuelve **antes** que la revisión: si se perdió la respuesta, recibes el resultado original, no un
  conflicto.
- `STALE_REVISION` no registra nada: la acción puede reenviarse tras actualizar `expectedRevision`.
- Dos acciones con la misma `expectedRevision`: solo una confirma; la otra recibe `STALE_REVISION` con el estado vigente.
- Una acción denegada **consume** su `actionId`: para intentarlo de nuevo hace falta uno nuevo.

## 5. Lectura, Realtime y reconexión

- Estado inicial y reconexión: `getSnapshot` = `select` de `mission_state`; tras reconectar, volver a leer y quedarse
  con la revisión mayor.
- En vivo: `postgres_changes` `UPDATE` de `mission_state` con filtro `room_id=eq.<id>` (`payload.new.snapshot`,
  `payload.new.revision`) e `INSERT` de `mission_events` (`payload.new.result`, `event_id`, `reason`). **Las dos tablas
  deben seguir publicadas**: si una no lo estuviera, Realtime rechazaría el canal entero (la migración `0002` lo asegura).
- Un `RESET_MISSION` es una acción más con `revision + 1`: la revisión nunca se reinicia.

## 6. Informe y puntaje

Al aceptarse `SUBMIT_REPORT`, el servidor guarda en `mission_reports`: `report_id`, `finding` (derivado de las
evidencias válidas, **no** del `finding` enviado), `evidence` (ids de observaciones útiles) y `score`
(`{ total, breakdown: { rigor, engineering, collaboration, communication, efficiency }, notes }`).

`FinalMissionReport` recalcula hoy el puntaje con los eventos que ve el cliente (`getAppliedEvents`, solo las
acciones aceptadas propias): en modo remoto le faltan las denegaciones y las acciones del otro jugador. Se recomienda
mostrar `mission_reports.score`.

## 7. Límites

| Límite | Valor |
|---|---|
| Salas creadas por usuario | 10 por hora |
| Códigos de sala fallidos | 10 por 10 minutos |
| Acciones denegadas guardadas por sala | 1000 |
| Cuerpo de las funciones | 4096 caracteres |
| Identificadores | `[A-Za-z0-9._:-]{1,100}` |

## 8. Orígenes (CORS)

La función solo responde con `Access-Control-Allow-Origin` a los orígenes de `ALLOWED_ORIGINS` (por defecto
`http://localhost:5173`, `http://127.0.0.1:5173` y `http://localhost:4173`). Al publicar en Vercel hay que añadir su URL
(`supabase secrets set ALLOWED_ORIGINS=...`); si no, el navegador bloqueará las llamadas.

## 9. Diferencias con `SUPABASE_EDGE_FUNCTION_SPEC.md` y cosas para revisar en el cliente

Diferencias (la implementación manda; la especificación del 01 puede actualizarse):

| Especificación del 01 | Implementado | Motivo |
|---|---|---|
| Errores de juego con HTTP 409/400 | HTTP 200 con `ok: false` | `functions.invoke` no entrega el cuerpo de un 4xx, y el gateway lee `data.code` |
| Ejemplo con `payload.priority: "critical"` | Se rechaza (400) | No existe en el contrato v3 y se validan los campos del `payload` |
| Snapshot de ejemplo con `score`, `batteryMaxWh`… | El snapshot real del motor (`MissionSnapshot` + `scenarioId`, `captureAttempts`, `reportId`, `reportFinding`) | El ejemplo está desactualizado |
| `ownerRole` en `create_room` | Aceptado (igual que `preferredRole`) | Lo envía el gateway |

Para revisar en `SupabaseMissionGateway` (no bloquean la demo, no se tocó su código):

1. Con un 401/403/429/500 `functions.invoke` devuelve `error` con un texto genérico; el gateway lo clasifica como
   `TRANSPORT_ERROR`. Para distinguirlos hay que leer `error.context` (la `Response`) con `await error.context.json()`.
2. `join_room` puede devolver `retry` y `rate_limited`: hoy ambos salen como `INVALID_ACTION`; `retry` debería reintentar.
3. Mostrar `mission_reports.score` en vez de recalcular el puntaje con los eventos locales.
