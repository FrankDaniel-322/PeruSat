# Entrega de integración: Rol 02 y Rol 04

## Autoridad y contratos

`src/contracts/mission.ts` es el contrato v3 de Misión A. `src/core/MissionGateway.ts` define la única interfaz que consume el store: `getSnapshot(roomId)`, `dispatch(roomId, action)` y `subscribe(roomId, listener)`. `MockMissionGateway` y `DevMissionGateway` implementan esa interfaz para pruebas locales; no son servicios remotos ni fuentes de verdad entre navegadores. `src/store/missionStore.ts` refleja únicamente snapshots confirmados. Las pantallas no deben editar recursos u observaciones.

La demo principal y `/role01-demo.html` usan `createMissionStore`. `src/devtools/DevApp.tsx` conserva un hook React propio (`devState.ts`) para una consola de diagnóstico que no está montada en esas entradas. Mantenerlo solo como herramienta temporal; si se incorpora a la aplicación, migrar esa proyección al store canónico antes de conectarla a Supabase. Así no aparecen dos rutas de sincronización en el producto.

El texto v3 disponible no enumera los valores permitidos de `status`; el Rol 02 debe confirmarlos con el Documento Maestro antes de cerrar el esquema SQL y la validación de entrada. No se alteran las fases, acciones ni propiedades de `MissionSnapshot` para resolver esa duda.

## Ciclo de sala pendiente del Rol 02

El ciclo de sala es un servicio **separado** de `MissionGateway`; no está implementado por los mocks actuales. La interfaz a acordar con Rol 01 debe cubrir:

| Operación | Entrada mínima | Salida o condición |
| --- | --- | --- |
| Crear sala | Usuario autenticado, `missionId: 'flood-piura-01'` | `roomId`, código de acceso temporal y rol del creador |
| Unirse a sala | Usuario autenticado, código de acceso | `roomId`, rol asignado, snapshot confirmado |
| Asignar rol | `roomId`, identidad autenticada, `ground` o `satellite` | Asignación única por sala; conflicto explícito si el rol está ocupado |
| Salir / reconectar | Identidad autenticada y `roomId` | Reutilizar rol asignado y cargar la revisión más reciente |

No confiar en `actorRole` enviado por el navegador: verificar en el backend que coincide con la membresía autenticada. No poner claves secretas de Supabase en el frontend y mantener RLS activo para lectura y escritura de salas, miembros y eventos.

## Adaptador Supabase pendiente del Rol 02

1. `getSnapshot` lee el estado persistido de la sala autorizada y valida `schemaVersion: 3` antes de entregarlo.
2. `dispatch` envía `actionId`, `actorRole`, `expectedRevision`, `type` y `payload` a una operación transaccional del backend. La operación valida rol, fase, recursos y transición; registra el ID para idempotencia, incrementa `revision` una vez y devuelve el snapshot confirmado. Reintentar el mismo ID devuelve el resultado anterior; reutilizarlo con otra acción se rechaza.
3. `subscribe` publica solo revisiones ya confirmadas. Al reconectar, consulta `getSnapshot` y recupera cambios perdidos. Los eventos llevan `eventId` único y se ignoran si ya fueron aplicados.
4. Mantener atómicas las comprobaciones de energía Wh, almacenamiento MB, presupuesto, masa kg y tiempo de contacto en segundos. Ningún recurso puede quedar negativo. Los costos del `DevMissionGateway` son parámetros didácticos de prueba y deben revisarse con el Rol 06.
5. Identificar por separado el contexto NASA GPM/IMERG y las observaciones ópticas simuladas. Una imagen `GAME_SIMULATION` debe seguir etiquetada **SIMULADO** en UI e informe; no convertir la URL de contexto NASA en procedencia de una captura real.

## Consumo por el Rol 04

Crear un store por cliente con `createMissionStore(gateway)`, llamar `connect(roomId)` al entrar y `resetUi()` al salir o desmontar. Leer `snapshot`, `connection`, `pending` y `error`; enviar `MissionAction` por `sendAction` con `expectedRevision` visible. Conservar el mismo `actionId` al reintentar una acción. `missionBridge` queda reservado para interacciones visuales React–Phaser. La UI definitiva puede tomar patrones de `/role01-demo.html` sin heredar el gateway de desarrollo.

## Pruebas de aceptación del adaptador real

- Dos navegadores autenticados en la misma sala reciben la misma revisión tras una solicitud.
- Un tercer usuario o un rol incorrecto no puede ejecutar una acción ni leer una sala ajena.
- Dos acciones con la misma `expectedRevision` no pueden confirmar dos transiciones incompatibles.
- Reintentar `actionId` no duplica observaciones ni descuentos de recursos.
- Desconexión y reconexión recuperan la última revisión sin perder eventos ni permitir recursos negativos.
- Las dos secuencias de Misión A terminan con informe prudente; nubosidad conduce a `insufficient` cuando la evidencia visual no basta.

Estas pruebas requieren Supabase del Rol 02. Las demos actuales solo verifican comunicación y reglas locales en memoria.
