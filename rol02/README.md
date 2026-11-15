# rol02 · Reglas de la Misión A (propuesta aislada)

Trabajo del Rol 02: motor de reglas A1/A2, esquema Supabase y pruebas. Vive **solo en esta carpeta**:
no toca `src/`, no entra en `tsc -b` ni en `vitest run` (la prueba usa `node:test` y su nombre no
coincide con `*.test.ts`). Detalle completo en [`docs/REGLAS_MISION_A.md`](docs/REGLAS_MISION_A.md).

## Estado

- **Sin ejecutar**: ni las pruebas ni el SQL se han corrido todavía (no había Node ni Postgres a mano).
- Los valores numéricos son didácticos, no del satélite real.

## Diferencias con el contrato real del repo (`src/contracts/mission.ts`)

El motor se escribió siguiendo el Documento Maestro; el contrato del repo es distinto en esto:

| Documento Maestro (lo que usa `rol02`) | Repo (`mission.ts`) |
|---|---|
| `status`: `ready` · `running` · `won` · `lost` | `active` · `completed` · `failed` |
| Acción plana: `{ type: 'REQUEST_OBSERVATION', targetId }` | `{ actionId, actorRole, expectedRevision, type, payload: { targetId } }` |
| `SUBMIT_REPORT { reportId }` | `SUBMIT_REPORT { payload: { finding } }` |
| `eventId` único por evento | `actionId` (cliente) + `eventId` (confirmación, en `ConfirmedMissionChange`) |

Además el motor necesita campos que el contrato aún no tiene: `scenarioId`, `captureAttempts`,
`reportId`/`reportFinding` en el snapshot y `requested`/`finding` en cada observación
(ver `src/missions/flood/types.ts`). `rol02/src/contracts/index.ts` es solo una copia del contrato del
Documento Maestro para que esta carpeta sea autónoma; **no es el contrato vigente**.

**Siguiente paso propuesto:** acordar con el Rol 01 los campos nuevos y adaptar `rules.ts` al contrato real
(un adaptador entre `MissionAction` del repo y las acciones internas), sin tocar `src/contracts/`.

## Cómo correr las pruebas

Node 22.6 o superior:

```bash
cd rol02
node --experimental-strip-types --test tests/flood.rules.node-test.ts
```
