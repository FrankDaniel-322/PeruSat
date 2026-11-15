# Backend Supabase · PERUSAT CREW (Rol 02)

Sala cooperativa real para dos clientes: el servidor es la fuente de verdad, ejecuta el motor único
`src/missions/flood/rules.ts` y publica los cambios por Realtime. El navegador **solo lee**.

```
navegador ──(JWT anónimo)──▶ Edge Function ──▶ applyAction() ──▶ commit_mission_event() ──▶ mission_state
   ▲                              create_room / dispatch_action          (transacción, bloqueo por sala)       │
   └──────────────── Realtime (postgres_changes de mission_state, con RLS) ◀────────────────────────────────┘
```

## Estado real (qué se ejecutó y qué no)

| Pieza | Estado | Evidencia |
|---|---|---|
| Migraciones `0001` + `0002` | **Ejecutadas en PostgreSQL real (PGlite, WASM) con un entorno Supabase simulado** | 8 pruebas SQL + 24 de aceptación y compatibilidad pasan (32); sin la `0002` fallaban 12 de las primeras 29 |
| Manejadores `create_room` y `dispatch_action` | **Probados contra ese SQL** (B01–B14) y contra el formato que espera `SupabaseMissionGateway` | `supabase/tests/backend.test.ts` |
| Un proyecto Supabase **real** (Auth anónima, Realtime, CORS desplegado, `supabase-js`, empaquetado de las funciones) | **NO probado** | Falta el proyecto: ver «Despliegue». `supabase/tests/smoke.ts` lo comprueba |
| Realtime entre dos navegadores | **NO probado** | Lo prueba el Rol 01 con la UI |
| `pnpm test` y `tsc -b` del cliente | **NO ejecutados** (no hay Node en la PC donde se escribió) | Los cambios al motor son mínimos (ver abajo) |

PGlite no es Supabase: reproduce PostgreSQL, RLS, roles y las funciones, pero no GoTrue (Auth), Realtime ni el
gateway de funciones. Por eso queda el humo contra un proyecto real antes de dar el backend por operativo.

## Qué hay aquí

| Ruta | Contenido |
|---|---|
| `migrations/0001_perusat_core.sql` | Tablas, RLS, `join_room`, `commit_mission_event` (sin cambios respecto a la rama base) |
| `migrations/0002_security_hardening.sql` | Correcciones de la auditoría (abajo) |
| `functions/create_room`, `functions/dispatch_action` | Puntos de entrada (Deno) |
| `functions/_shared/` | Validación, manejadores, motor (`engine.ts` reexporta `src/missions/flood/`) y acceso a datos |
| `tests/` | Pruebas (PGlite + Deno) y `smoke.ts` para un proyecto real |
| `config.toml` | Auth anónima y `verify_jwt = false` (el JWT se valida dentro con `auth.getUser`) |

Contrato público para el Rol 01: `docs/integration/ROLE02_BACKEND_API.md`.

## Auditoría: qué se encontró y se corrigió

| Hallazgo | Corrección |
|---|---|
| `anon`/`authenticated` conservaban privilegios de tabla (solo se revocaba la escritura) | `revoke all` y `grant select` únicamente a `authenticated`; RLS decide las filas |
| Funciones `SECURITY DEFINER` con `search_path = public` | `search_path = ''` y todo calificado |
| `commit_mission_event` miraba el historial antes de la membresía | Membresía primero |
| Un `actionId` reutilizado con otro contenido se trataba como duplicado | Se rechaza (`conflict_payload` → HTTP 409 `DUPLICATE_ACTION`) |
| `join_room`: códigos de 6 hex (16 M) y sin límite de intentos | 31 símbolos sin ambigüedad (887 M), generador criptográfico y 10 fallos / 10 min |
| `create_room_with_state` aceptaba cualquier snapshot y salas ilimitadas | Valida sala, escenario, fase, estado y revisión 0; 10 salas/hora por usuario |
| Sin orden estricto de eventos para el puntaje | Columna `seq` |
| El puntaje se calculaba en el cliente con un historial incompleto | Se calcula en el servidor al enviar el informe y se guarda en `mission_reports.score` |
| Cualquier campo extra de la acción llegaba a `mission_events.action` | Acción canónica estricta, charset y longitudes |
| Intentos denegados ilimitados por sala | Tope de 1000 |
| **Motor:** `computeScore` restaba 8 puntos a cualquier clasificación correcta sobre un alias de zona (`rio-piura`, `rio-chira`) | Se normaliza el alias; hay prueba (`B13b`) |
| **Motor:** imports sin extensión no cargan en Deno | `.ts` en los imports relativos de `rules.ts`, `config.ts` y `types.ts` |

### Cambios al motor (`src/missions/flood/`)

Solo dos, ambos mecánicos: extensión `.ts` en los imports relativos (ya permitida por `allowImportingTsExtensions`
en `tsconfig.json`) y `normalizeTargetId(...)` en el cálculo de `wrongFindings`. No se tocó `src/contracts/`.

### Decisiones para encajar con el cliente del Rol 01

`SupabaseMissionGateway` (rama `feat/multiplayer-p0-fixes`) ya existía cuando se terminó el backend. Las funciones se
alinearon con él, sin tocar su código:

- `create_room` acepta `ownerRole` (nombre que envía el cliente) además de `preferredRole`.
- `dispatch_action` responde `{ ok, change: { eventId, actionId, snapshot } }` y envía los resultados de juego
  (revisión vieja, regla denegada, `actionId` repetido con otro contenido) en un **200** con `ok: false`, porque
  `supabase.functions.invoke` oculta el cuerpo de las respuestas no 2xx. Los fallos de protocolo siguen siendo 4xx/5xx.
- Tolera el `expectedRevision` repetido fuera de la acción (si coincide con el de la acción).
- Realtime mantiene publicadas `mission_state` **y** `mission_events`: el cliente se suscribe a las dos y, si una no
  estuviera publicada, Realtime rechaza el canal entero.

### Límites conocidos (no corregidos)

- `RESET_MISSION` lo puede ejecutar cualquiera de los dos jugadores en cualquier fase (así lo define el contrato v3).
- Las acciones denegadas del propio jugador se guardan (alimentan el puntaje); hay tope de 1000 por sala.
- El puntaje del informe se calcula con el historial leído justo antes de confirmar: una denegación que llegue en
  ese instante exacto podría no contarse.
- Una sesión anónima nueva reinicia los límites por usuario. Para producción real habría que limitar por IP o CAPTCHA.

## Pruebas locales (sin Docker ni cuenta Supabase)

Requisitos: [Deno](https://deno.com) 2.x. Desde la raíz del repositorio:

```bash
deno test --config supabase/deno.json --allow-read --allow-env --allow-sys supabase/tests/
```

La primera vez descarga PGlite (npm) y `@std/assert` (jsr). Las pruebas aplican `0001` y `0002` sobre una base
nueva y recorren los casos B01–B14 del documento del Rol 02.

## Despliegue en un proyecto Supabase real

Lo hace la persona dueña del proyecto (las claves no se comparten por chat ni se suben a GitHub):

1. Crear **un** proyecto en [supabase.com/dashboard](https://supabase.com/dashboard) y anotar la región.
2. *Authentication → Sign In / Providers →* activar **Allow anonymous sign-ins**.
3. Instalar la [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), luego
   `supabase login` y `supabase link --project-ref <ref>`.
4. Aplicar las migraciones en orden: `supabase db push` (o pegar `0001` y después `0002` en el SQL Editor).
5. Orígenes permitidos de las funciones (la URL de Vercel cuando exista):
   `supabase secrets set ALLOWED_ORIGINS=https://<tu-app>.vercel.app,http://localhost:5173`.
   `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase en la función: no se configuran a mano.
6. `supabase functions deploy create_room` y `supabase functions deploy dispatch_action`.
7. Humo con dos usuarios reales (solo la clave **publicable**, nunca la `service_role`):

   ```bash
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=<clave> \
     deno run --config supabase/deno.json --allow-net --allow-env supabase/tests/smoke.ts
   ```

8. Compartir con el Rol 01 únicamente: URL del proyecto, clave publicable y `docs/integration/ROLE02_BACKEND_API.md`.

### Si el empaquetado no encuentra el motor

`functions/_shared/engine.ts` importa `../../../src/missions/flood/*.ts`, fuera de `supabase/`. Si
`supabase functions deploy` no incluyera esos archivos, copiar `src/missions/flood/` y `src/contracts/mission.ts`
a `supabase/functions/_shared/engine/` (con la misma estructura relativa) y cambiar **solo** las rutas de
`engine.ts`. No se debe escribir otro motor.
