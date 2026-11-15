# Demo visual de dos operadores

Entrada aislada: `/role01-demo.html` con `pnpm dev`. Los archivos de esta demo están en `src/role01-demo/`; no reemplaza las pantallas del Rol 04 ni modifica contratos, gateway o store. `pnpm build` incluye esta entrada en `dist/`. Para generarla por separado: `pnpm exec vite build --config src/role01-demo/vite.config.ts` (salida en `dist/role01-demo/`).

## Qué muestra

- Dos paneles independientes: Base CNOIS y Satélite PerúSAT-1.
- Fase, revisión, presupuesto didáctico, energía Wh, almacenamiento MB, contacto en segundos, solicitud e imagen simulada.
- Estados de carga, confirmación, error y conexión.
- Secuencia rutinaria y secuencia con calidad `cloudy`. El escenario nublado usa `finding: 'insufficient'` para el informe.
- Un ejemplo de acción rechazada y otro de pérdida/restablecimiento de conexión.

La pantalla usa `createMissionStore()` para ambos operadores. Los dos stores reciben snapshots del mismo `DevMissionGateway` **local en memoria**. `demoSteps.ts` solo construye `MissionAction` tipadas; no calcula recursos ni aplica transiciones. Los valores y reglas de prueba del `DevMissionGateway` pertenecen a las herramientas de desarrollo existentes y deben ser sustituidos por las reglas del Rol 02. Esta demo no conecta dos navegadores ni persiste datos.

## Conectar con el gateway real

1. Crear una implementación backend de `MissionGateway` con `getSnapshot(roomId)`, `dispatch(roomId, action)` y `subscribe(roomId, listener)`.
2. Inyectar **la misma instancia** de ese gateway en dos stores creados con `createMissionStore()`, o crear un store por navegador con su rol autenticado. Cada panel solo lee su store.
3. Mantener `actionId` estable en reintentos y enviar `expectedRevision` desde el snapshot del operador. El backend debe autorizar rol y fase, confirmar revisiones e idempotencia y publicar el snapshot después de persistirlo.
4. Reemplazar los controles de falla de esta demo (`forcedQuality`, `setConnectionState`) con eventos reales de red y resultados de calidad del Rol 02. Mantener la etiqueta **SIMULADO** cuando la observación sea didáctica.
5. El Rol 04 puede extraer `Panel`, `Resource` y la barra de progreso a sus vistas finales. El texto y las decisiones visuales son provisionales.

## Verificación disponible

Se ejecutó un recorrido con Deno del constructor de acciones contra el gateway de desarrollo existente: `routine` y `cloudy` terminaron en `debrief`, revisión 7; las observaciones resultaron `valid` y `cloudy`, respectivamente. Otra comprobación confirmó que una solicitud enviada por `satellite` se rechaza sin avanzar la revisión y que el gateway emite los estados `disconnected` y `connected`. `deno lint --rules-exclude=no-sloppy-imports src/role01-demo` pasó con tres archivos. Esto comprueba los escenarios y la sintaxis, no el renderizado React. La captura de pantalla y la compilación requieren instalar dependencias npm.
