# QA multijugador: Misión A1

Suite: `scripts/qa/multiplayer.acceptance.test.ts`. Usa tres clientes Supabase separados, cada uno con autenticación anónima propia. Solo consume URL y clave pública. No requiere ni acepta `service_role`. Crea salas de prueba A1; no modifica salas existentes.

## Ejecutar

Desde el worktree `test/multiplayer-acceptance`:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm exec vitest run scripts/qa/multiplayer.acceptance.test.ts
corepack pnpm build
```

La primera orden de Vitest ejecuta la prueba local y marca las remotas como **omitidas**, nunca como aprobadas, salvo que se configure explícitamente:

```powershell
$env:QA_RUN_REMOTE='1'
$env:QA_SUPABASE_URL='https://PROYECTO.supabase.co'
$env:QA_SUPABASE_ANON_KEY='CLAVE_PUBLICA'
$env:QA_TIMEOUT_MS='15000' # opcional
corepack pnpm exec vitest run scripts/qa/multiplayer.acceptance.test.ts --reporter=verbose
```

No poner valores reales en archivos versionados ni compartir la salida de sesiones/JWT. Para la prueba remota hacen falta autenticación anónima habilitada, migración aplicada, Realtime para `mission_state`, RPC `join_room` y Edge Functions `create_room` y `dispatch_action` desplegadas. Ninguno de esos servicios se simula dentro de la suite remota. Dos identidades de prueba son necesarias para la partida y una tercera para RLS.

## Cobertura y criterio de aprobación

- Local: dos receptores del gateway de desarrollo ven 13 transiciones de A1 y dos observaciones válidas; prueba mecánica del recorrido, **no** prueba de red o seguridad.
- Remoto: A crea sala, B se une y recibe rol distinto; ambos comparan snapshot v3 y B debe recibir cada revisión mediante Realtime. Se recorren dos capturas, solicitudes de enlace, transmisiones, clasificaciones e informe final `won`.
- Seguridad: el tercero no lee `mission_state` ni reinicia sala ajena; Ground no puede aprobar como Satellite; Satellite no clasifica ni informa; un miembro no puede modificar directamente el JSON del snapshot por RLS.
- Concurrencia: dos clientes envían acciones válidas sobre la misma revisión y solo una se confirma. Reenviar una captura desde la API remota con el mismo `actionId`, omitiendo el cache local, debe devolver la **misma** confirmación sin cambiar recursos ni revisión.
- Reconexión: después de volver a suscribirse, B recibe el snapshot final. Esta prueba cubre resuscripción; un corte de red real requiere una prueba adicional controlada en navegador o red de CI.

Una falla de la suite remota es un hallazgo, no una razón para suavizar la aserción. El tiempo límite configurable evita esperar indefinidamente al canal Realtime.

## Política RESET_MISSION pendiente

La suite verifica que un tercero no puede reiniciar una sala ajena. No hay política acordada en los contratos actuales para determinar cuál de los dos miembros puede reiniciar ni en qué fase. Rol 02 debe definirla y añadir un caso positivo y otro negativo de miembro autorizado antes de habilitar el botón remoto. No se presupone que Ground o Satellite estén autorizados.

## Incompatibilidades de contrato observadas

| Referencia | Diferencia | Acción sugerida |
| --- | --- | --- |
| `docs/integration/SUPABASE_EDGE_FUNCTION_SPEC.md` §4.2 | El ejemplo de respuesta usa `phase: plan`, `status: in_progress`, `score` y recursos fuera de `resources`. El validador v3 exige `planning`, `running` y `resources`. | Rol 01/Rol 02: corregir el ejemplo y hacer que la función devuelva `ConfirmedMissionChange` con snapshot v3. |
| Especificación §4.2 / `SupabaseMissionGateway.dispatch` | El cliente envía `expectedRevision` dentro de `action` y también al nivel superior; el ejemplo solo dentro. | Rol 02: aceptar una sola fuente o comprobar igualdad estricta. |
| Especificación §4.2 / gateway | El ejemplo de acción incluye `priority`, fuera de `MissionAction`; el gateway solo comprueba campos requeridos y permite extras. | Rol 01/Rol 02: eliminar del ejemplo o versionar explícitamente la extensión. |
| Especificación §4.2 / gateway | El ejemplo de duplicado admite error 409; el cache local puede ocultarlo. | Rol 02: usar `actionId` persistido por sala, devolver `change` original para reintento idéntico y rechazar reutilización del ID con otro contenido. |
| SQL `mission_events` / `MissionGateway` | SQL deduplica `event_id`; `actionId` y `eventId` no están ligados por restricción persistida. | Rol 02: imponer unicidad de `actionId` por sala y conservar relación estable con `eventId`. |
| SQL `commit_mission_event` / especificación | SQL devuelve `{status, revision}`; el gateway espera `{ok:true,change:{eventId,actionId,snapshot}}`. | Rol 02: construir y validar esa respuesta en Edge Function tras el commit; no inventarla en cliente. |
| `MissionGatewayError` / especificación | Los códigos de regla remotos se reducen a `INVALID_ACTION`; el parsing de errores HTTP usa texto libre. | Rol 01/Rol 02: acordar `code` JSON estable y mapearlo de forma explícita. |

La suite no cambia SQL, Edge Functions, React ni Phaser. Un fallo remoto por ausencia de funciones o por RLS debe corregirse en el backend; uno por presentación o manejo de conexión debe coordinarse con Antigravity. No ejecutar la migración desde esta suite.
