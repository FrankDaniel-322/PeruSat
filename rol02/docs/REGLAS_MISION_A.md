# Rol 02 · Reglas de la Misión A (flood-piura-01)

Entregable P0 del rol 02 según el documento maestro: **reglas A1/A2, tablas Supabase, aplicación de
eventos y sala Realtime**. Todo lo numérico es **didáctico**, no una especificación de PerúSAT-1.

| Archivo | Qué es | Estado |
|---|---|---|
| `src/missions/flood/rules.ts` | Motor de reglas (funciones puras) | escrito y corregido (v2), **pruebas aún sin ejecutar** |
| `src/missions/flood/config.ts` | Perfiles, zonas, escenarios A1/A2, textos de error | escrito |
| `src/missions/flood/types.ts` | Extensiones propuestas a contracts v3 | **pendiente de aprobación del rol 01** |
| `tests/flood.rules.node-test.ts` | Casos de la lista de aceptación + prueba aleatoria de invariantes | escrito (con casos nuevos en v2), **sin ejecutar** (no hay Node en esta PC) |
| `supabase/migrations/0001_perusat_core.sql` | Tablas, RLS, `join_room`, `commit_mission_event` | escrito y corregido (v2), **sin ejecutar** |
| `src/contracts/index.ts` | Copia de solo lectura de contracts v3 | borrar cuando exista el repo |

## 1. Parámetros (sección 10 del documento)

| Variable | Valor | Regla |
|---|---|---|
| `energyWh` | 100 | captura −12 Wh · transmisión −4 Wh por archivo |
| `storageMb` | 70 | estándar 14 MB · detallada 28 MB · comprimida 9 MB |
| `contactSeconds` | 80 | envío = `ceil(sizeMb × 8 / 4)` s → 14 MB = 28 s · 28 MB = 56 s · 9 MB = 18 s |
| `budgetCredits` | 100 | estándar 10 · detallada 20 · comprimida 10 *(decisión 02)* |
| `massKg` | 0 = "sin dato" | pendiente de rol 06; la UI debe ocultarla mientras sea 0 |

## 2. Escenarios

| | A1 · Práctica | A2 · Alerta por lluvias |
|---|---|---|
| Recursos iniciales | los de arriba | los de arriba |
| Calidad de capturas | siempre `valid` | río: 1.er intento `cloudy`, 2.º `valid`; el resto `valid` |
| Para ganar | 2 observaciones útiles | 1 observación útil |
| Puntaje completo de rigor | 2 | 2 (la 2.ª es el "extra sin sobreafirmar") |
| Incidentes P0 | ninguno | **nubosidad** (guionada) + **archivo grande vs. ventana** (surge sola de las reglas) |

Zonas (guion de la demo, no dato real): `piura-rio` y `piura-urbano` muestran `possible_flood`;
`piura-agricola` muestra `normal`. Archivo corrupto y batería baja quedan como P1 (la batería baja
ya aparece sola si se agota la energía).

## 3. Flujo y quién puede qué

```
briefing ─REQUEST_OBSERVATION(ground)→ planning ─APPROVE_PLAN(satellite)→ capture
capture ─CAPTURE_IMAGE(satellite)→ capture (sin plan: otra toma exige nueva petición y aprobación)
cualquier fase ─REQUEST_TRANSMISSION(ground)→ downlink ─TRANSMIT_IMAGE(satellite)→ downlink
downlink ─CLASSIFY_IMAGE(ground)→ review ─SUBMIT_REPORT(ground)→ debrief (won | lost)
cualquier fase ─RESET_MISSION(cualquiera)→ briefing
```

Las fases son un bucle: tras una imagen nublada la Base vuelve a pedir otra toma (ejemplo del documento).
Mientras haya un **plan en curso** (zona pedida sin aprobar, o plan aprobado sin capturar), pedir,
transmitir y clasificar otra imagen **no cambia la fase**: así la Base puede avanzar con el envío de
una toma mientras el Satélite prepara la siguiente, sin perder el plan ni recibir penalización.
Toda acción denegada devuelve un `DenialCode` y un texto en español (`DENIAL_MESSAGES` en `config.ts`,
listo para que 03/04 lo usen como microcopy).

## 4. Decisiones de interpretación (confirmar con 01 y 03)

1. **No hay acción "rechazar plan".** `APPROVE_PLAN` = el Satélite elige y aprueba el perfil; si es inviable se deniega con explicación (energía, memoria o créditos).
2. **Los costes se cobran al capturar**, no al aprobar.
3. **Un plan = una captura.** Eso obliga a que Base y Satélite se coordinen en cada toma.
4. **Transmitir no libera memoria** (el contrato no tiene acción de borrar), así la memoria es un tope real.
5. **La ventana de contacto es única por misión** (80 s en total); no se renueva.
6. **La calidad es determinista** por guion y por nº de intento: así toda partida es reproducible y probable.
7. **Una imagen no válida solo puede clasificarse como `insufficient`**; intentar otra cosa se deniega (`INVALID_EVIDENCE`) y resta puntos.
8. El informe concluye lo más prudente que sostienen las imágenes válidas: `possible_flood` > `normal` > `insufficient`.

## 5. Puntaje didáctico (100 puntos, calculado solo desde el historial validado)

| Categoría | Máx. | Fórmula |
|---|---|---|
| Evidencia y rigor | 30 | `30 × min(1, útiles / evidenciaCompleta)` − 10 por intento de sobreafirmar − 8 por clasificación que no coincide con la imagen |
| Decisiones de ingeniería | 25 | 25 − 5 por acción inviable (sin energía, memoria, créditos o ventana); **0 si no hubo ninguna captura** |
| Colaboración | 20 | 20 − 5 por acción fuera de turno (sin petición, sin plan, fase o zona equivocada); **0 si no hubo ninguna captura** |
| Comunicación | 15 | `15 × archivos válidos transmitidos / archivos transmitidos` |
| Eficiencia | 10 | `10 × capturas válidas / capturas` |

Casos de referencia (verificados a mano, las pruebas los comprueban cuando se ejecuten):
A1 perfecta = **100** · A2 jugada prudente = **97** · A2 transmitiendo lo nublado y sobreafirmando = **58** ·
informe sin capturar nada = **0**.

## 6. Cambios que propongo al contrato v3 (el 01 decide)

| Cambio | Motivo |
|---|---|
| `MissionSnapshot.scenarioId: 'A1' \| 'A2'` | el motor necesita saber qué guion aplicar |
| `MissionSnapshot.captureAttempts` | hace reproducible la nubosidad |
| `MissionSnapshot.reportId?`, `reportFinding?` | marcar el informe enviado y su conclusión |
| `Observation.requested?: boolean` | `TRANSMIT_IMAGE` exige petición previa de la Base |
| `Observation.finding?: Finding` | que ambos jugadores vean la clasificación |
| `RESET_MISSION` con `scenarioId?` opcional | cambiar de A1 a A2 sin crear otra sala |

**Inconsistencia en el PDF:** el informe usa `insufficient_evidence` (pág. 10) pero el tipo `Finding` usa `insufficient` (pág. 11). El código usa `insufficient`; hay que unificar el texto del informe.

## 7. Cómo se conecta con Supabase

1. El cliente envía una intención (`ActionEnvelope`) a una **Edge Function**.
2. La función verifica el JWT, lee snapshot y rol, y ejecuta `applyAction()` (el mismo `rules.ts`).
3. Llama a `commit_mission_event` con la clave de servicio: bloquea la sala, comprueba idempotencia (`eventId`: texto de 1 a 100 caracteres, único por sala; se recomienda `crypto.randomUUID()`), pertenencia y `expectedRevision`, y guarda estado + evento + observaciones en una transacción.
4. Realtime avisa a ambos navegadores; Zustand actualiza el HUD.

Los clientes **solo leen** (RLS por pertenencia a la sala); no existe ninguna política de escritura.

## 8. Qué necesito de los demás

- **01:** aprobar o corregir los cambios de la sección 6; crear el repo para mover estos archivos; confirmar Edge Function (recomendado) frente a RPC en SQL (duplicaría las reglas).
- **03:** revisar los textos de `DENIAL_MESSAGES` y las notas del puntaje; validar el guion de las zonas.
- **04:** lista de acciones habilitadas por fase y rol (sección 3); no recalcular nada en la interfaz.
- **06:** ficha IMERG con fuente y unidad, y la masa de PerúSAT-1 con fuente (hoy `massKg = 0`).

## 9. Cómo correr las pruebas

Necesita **Node.js 22.6 o superior** (en esta PC no está instalado):

```bash
node --experimental-strip-types --test tests/flood.rules.node-test.ts
```

## 10. Correcciones de la revisión (v2)

| Problema | Corrección |
|---|---|
| `eventId` era `uuid` en SQL y `string` en el contrato | La columna y el parámetro pasan a `text` (1–100 caracteres); la clave es `(room_id, event_id)` |
| La búsqueda de duplicados no filtraba por sala | Ahora filtra por `room_id` |
| Pedir/transmitir/clasificar otra imagen perdía el plan en curso y penalizaba | Esas acciones no cambian la fase mientras haya un plan en curso (`hasPendingPlan`) |
| Tras `RESET_MISSION` el informe nuevo podía no guardarse (`on conflict do nothing`) | El reinicio borra también los informes de la partida anterior |
| Un informe sin capturar nada daba 45 puntos | Ingeniería y colaboración valen 0 si no hubo ninguna captura |
| Una acción `null` o sin `type` rompía el motor | Se deniega con `UNKNOWN_ACTION` |

Sigue pendiente (no se tocó): quién puede ejecutar `RESET_MISSION`, límite de intentos en `join_room`,
la Edge Function y el cliente Realtime, y ejecutar pruebas y SQL en un entorno real.
