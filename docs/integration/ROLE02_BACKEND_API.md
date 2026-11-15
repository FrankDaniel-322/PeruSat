# Contrato público del backend (Rol 02 → Rol 01)

Estado: **probado contra PostgreSQL con las migraciones reales, no contra un proyecto Supabase desplegado**
(ver `supabase/README.md`). Los nombres y códigos de aquí son los implementados; si Rol 01 necesita cambiar
alguno, se acuerda antes de congelar.

## 1. Sesión

El jugador entra con sesión anónima: `supabase.auth.signInAnonymously()`. Todas las llamadas llevan
`Authorization: Bearer <access_token>`; `supabase.functions.invoke()` y el cliente `supabase-js` lo añaden solos.
Un usuario anónimo autenticado tiene `auth.uid()`; la clave publicable sin sesión **no** sirve.

## 2. Operaciones

| Operación | Cómo se llama | Quién escribe |
|---|---|---|
| Crear sala | `POST /functions/v1/create_room` | Edge Function |
| Unirse | `supabase.rpc('join_room', { p_join_code })` | RPC con `auth.uid()` |
| Acción de juego | `POST /functions/v1/dispatch_action` | Edge Function |
| Leer estado | `from('mission_state').select('snapshot,revision').eq('room_id', id).single()` | solo lectura (RLS) |
| Cambios en vivo | Realtime `postgres_changes`, tabla `mission_state` | — |
| Informe y puntaje | `from('mission_reports').select('*').eq('room_id', id)` | solo lectura (RLS) |

### `create_room`

Petición: `{ "scenarioId": "A1" | "A2", "preferredRole"?: "ground" | "satellite" }` (por defecto `ground`; no se
admiten más campos).
Respuesta 200: `{ "roomId": "<uuid>", "joinCode": "K7M2QX", "role": "ground", "revision": 0 }`.
El código tiene 6 caracteres de `A-H J K M N P-Z 2-9` y se escribe sin distinguir mayúsculas.

### `join_room(p_join_code text)` → `jsonb`

| `status` | Significado | Otros campos |
|---|---|---|
| `joined` | Entraste con el rol libre | `roomId`, `role` |
| `already_member` | Ya estabas en la sala (reconexión) | `roomId`, `role` |
| `room_full` | Ya hay un `ground` y un `satellite` | — |
| `room_not_found` | Código inexistente | — |
| `rate_limited` | 10 códigos fallidos en 10 minutos | — |
| `retry` | Dos personas entraron a la vez; repetir | — |

Sin sesión lanza `not_authenticated`. El rol lo asigna el servidor.

### `dispatch_action`

Petición: `{ "roomId": "<uuid>", "action": MissionAction }` con la acción exacta del contrato v3
(`actionId`, `actorRole`, `expectedRevision`, `type`, `payload`). Se rechaza cualquier campo extra, el formato plano
del Documento Maestro y los textos fuera de `[A-Za-z0-9._:-]{1,100}` (`reportId` admite además espacios).
Cuerpo máximo: 4096 caracteres.

Respuesta 200: `{ "eventId": "<actionId>", "actionId": "<actionId>", "snapshot": MissionSnapshot, "duplicate"?: true }`.
`eventId` es el propio `actionId`.

`actorRole` **no autoriza nada**: el servidor lo compara con la membresía del JWT y devuelve 403 si no coincide.

## 3. Errores

Forma: `{ "code": "...", "message": "texto en español", ... }`. `ACTION_DENIED` añade `denialCode` y `revision`;
`REVISION_CONFLICT` añade `revision` y `snapshot`.

| HTTP | `code` | Cuándo | Sugerencia para `MissionErrorCode` |
|---|---|---|---|
| 400 | `INVALID_ACTION` | Cuerpo o acción mal formados | `INVALID_ACTION` |
| 401 | `NOT_AUTHENTICATED` | Sin sesión o JWT inválido | `NOT_CONNECTED` |
| 403 | `NOT_AUTHORIZED` | No eres miembro (o la sala no existe: misma respuesta) o `actorRole` ≠ tu rol | `INVALID_ACTION` con el mensaje (el contrato no tiene código propio; añadirlo es decisión del 01) |
| 409 | `REVISION_CONFLICT` | `expectedRevision` viejo o carrera entre dos acciones | `REVISION_CONFLICT`; usar el `snapshot` que trae |
| 409 | `DUPLICATE_ACTION` | Mismo `actionId` con otro contenido u otro usuario | `DUPLICATE_ACTION` |
| 413 | `PAYLOAD_TOO_LARGE` | Cuerpo > 4096 caracteres | `INVALID_ACTION` |
| 422 | `ACTION_DENIED` | Lo deniegan las reglas del juego (`denialCode`, ej. `WRONG_ROLE`, `INVALID_EVIDENCE`) | `INVALID_ACTION` con `message` (microcopy listo para la UI) |
| 429 | `RATE_LIMITED` | Demasiadas salas, intentos denegados o códigos fallidos | `TRANSPORT_ERROR` |
| 500 | `TRANSPORT_ERROR` | Fallo interno; **reintentar con el mismo `actionId`** | `TRANSPORT_ERROR` |

## 4. Idempotencia y concurrencia

- El `actionId` se genera **una vez** por intención y se reutiliza en todos los reintentos de red.
- Reintento con el mismo `actionId` y el mismo contenido: no se aplica ni se cobra otra vez.
  - Si se aceptó: 200 con `duplicate: true` y el **snapshot vigente** (puede ser más nuevo que el original: el
    cliente se queda con la revisión mayor; no se fabrica un snapshot histórico).
  - Si se denegó: la misma respuesta 422, con `duplicate: true`.
- El reintento se resuelve **antes** que la revisión: si se perdió la respuesta, no recibes un conflicto sino el
  resultado original.
- `REVISION_CONFLICT` no registra nada: la acción puede reenviarse (con el mismo o con otro `actionId`) tras
  actualizar `expectedRevision`.
- Dos acciones con la misma `expectedRevision`: solo una confirma; la otra recibe 409 con el estado vigente.
- Una acción denegada **consume** su `actionId`: para intentarlo de nuevo se necesita uno nuevo.

## 5. Lectura, Realtime y reconexión

- Estado inicial y reconexión: `getSnapshot` = `select` de `mission_state`. Tras reconectar, volver a leer y quedarse
  con la revisión mayor.
- En vivo: `postgres_changes` `UPDATE` sobre `mission_state` con filtro `room_id=eq.<id>`; `payload.new.snapshot` y
  `payload.new.revision`. Solo se publica ese cambio; los eventos denegados del otro jugador no llegan.
- El mensaje de Realtime **no trae `eventId`/`actionId`**. Para el `ConfirmedMissionChange` de una acción remota se
  sugiere `eventId = "rev-<revision>"`: el store ya ignora revisiones repetidas y recarga si hay un salto de revisión.
- Una sala nueva o reiniciada vuelve a `revision` creciente (nunca se reinicia el contador): `RESET_MISSION` es una
  acción más con `revision + 1`.

## 6. Informe y puntaje

Al aceptarse `SUBMIT_REPORT`, el servidor guarda en `mission_reports`: `report_id`, `finding` (derivado de las
evidencias válidas, **no** del `finding` enviado), `evidence` (ids de observaciones útiles) y `score`
(`{ total, breakdown: { rigor, engineering, collaboration, communication, efficiency }, notes }`).

`FinalMissionReport` hoy recalcula el puntaje con los eventos que ve el cliente; en modo remoto le faltarían las
denegaciones del otro jugador. Se recomienda mostrar `mission_reports.score` en su lugar.

## 7. Límites

| Límite | Valor |
|---|---|
| Salas creadas por usuario | 10 por hora |
| Códigos de sala fallidos | 10 por 10 minutos |
| Acciones denegadas guardadas por sala | 1000 |
| Cuerpo de `dispatch_action` / `create_room` | 4096 caracteres |
| Identificadores | `[A-Za-z0-9._:-]{1,100}` |

## 8. Orígenes (CORS)

La función solo responde con `Access-Control-Allow-Origin` a los orígenes de `ALLOWED_ORIGINS` (por defecto
`http://localhost:5173`, `http://127.0.0.1:5173` y `http://localhost:4173`). Al publicar en Vercel hay que añadir su URL
(`supabase secrets set ALLOWED_ORIGINS=...`); si no, el navegador bloqueará las llamadas.
