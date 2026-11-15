# QA de navegador y jugabilidad

Estas pruebas son adicionales a `multiplayer.acceptance.test.ts`. Se ejecutan con Edge/Chromium sobre la app real, sin invocar `DevMissionGateway` directamente ni modificar React/Phaser.

**Ejecución del 15-11-2026 sobre el commit base `da67beb`:** 10 casos Playwright: **5 aprobados, 3 fallidos, 2 omitidos**. Los aprobados cubren entrada/lobby, cambio de operador local, tecla E y dos tamaños visuales. Los fallidos son herramientas técnicas visibles y los recorridos A1/A2 bloqueados tras transmitir. Las pruebas omitidas corresponden a menú/Jornadas y habitaciones aún ausentes en esta base. Vitest: 51 aprobados y 2 remotos omitidos; build correcto.

## Comandos

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm exec playwright test -c scripts/qa/playwright.config.ts
corepack pnpm test
corepack pnpm build
```

En Windows se usa Edge instalado. Para Chromium administrado por Playwright, instalarlo con `corepack pnpm exec playwright install chromium` y configurar `QA_BROWSER_CHANNEL=chromium` si se requiere en otra máquina. El config inicia Vite en `127.0.0.1:4174` y lo detiene al terminar. Para evaluar una entrega nueva sin copiar ni alterar el código de Antigravity, fijar `QA_GAME_URL` a su servidor local o de pruebas y correr el mismo comando. No usar una URL productiva para pruebas que generan partidas.

`QA_MENU_READY=1` activa las pruebas de menú/Jornadas cuando esas pantallas estén disponibles. `QA_ROOMS_READY=1` activa las de habitaciones cuando haya etiquetas visibles `room-name`, `player-position`, `mission-revision` y `mission-resources`, o se adapten los selectores a la UI entregada. Estas pruebas figuran como **omitidas** hasta entonces. No cuentan como aprobadas.

Las capturas y traces quedan en `scripts/qa/artifacts/`, ignorados por Git. Se generan a 1366×768 y 1920×1080. La prueba espera a que Phaser haya dibujado la textura, comprueba proporción del canvas, controles y límites del modal. Las capturas `tooltip-*` permiten revisar la posición del texto dibujado en Phaser; las `inicio-*` y `consola-*` sirven para comparar versiones. No existe aún una línea base visual aprobada: conservar estas capturas como evidencia, y comparar con la versión de Antigravity antes de aceptar diferencias.

**Comparación visual observada:** a 1366×768 la cabina y el modal ocupan bien la pantalla; a 1920×1080 el juego queda centrado con márgenes amplios y textos de navegación/HUD pequeños. El arte conserva la proporción 16:9 y no se vieron personajes duplicados. El tooltip de Phaser se guardó como captura, pero su contraste/legibilidad requiere inspección visual al cierre de la animación; la prueba geométrica no acredita legibilidad de texto dibujado en canvas.

## Hallazgos reproducibles en la base del worktree

1. **P0: la partida queda bloqueada tras la primera transmisión.** Recorrido de navegador: Base solicita → Satélite aprueba/captura → Base pide enlace → Satélite transmite. El snapshot permanece en `downlink`; la acción visible sigue siendo «Transmitir por Antena» y la consola de análisis muestra el informe pasivo, no el control de clasificación. `src/missions/flood/rules.ts` deja `phase = 'downlink'` tras transmitir (línea aproximada 290) y solo cambia a `review` dentro de `CLASSIFY_IMAGE` (aprox. 304). `src/game/station/StationCanvas.tsx` muestra el formulario de clasificación únicamente si `phase === 'review'` (aprox. 738). **Sugerencia para Rol 02 + Antigravity:** acordar fase después de la transmisión y habilitar clasificación sin circularidad. No se aplicó parche.
2. **P0: A1 no puede pedir la segunda observación desde la UI existente.** `src/game/station/StationCanvas.tsx` deshabilita «Enviar Solicitud al Satélite» fuera de `briefing` (aprox. 546); A1 requiere dos capturas. La prueba A1 continuará hasta esa aserción cuando se resuelva el bloqueo anterior. **Sugerencia para Antigravity:** habilitar un nuevo ciclo usando el estado de misión autorizado, sin reiniciar recursos.
3. **P1 de presentación: herramientas técnicas en la navegación normal.** `src/App.tsx` muestra «DevTools de Integración» y «Arnés Técnico React-Phaser» (aprox. líneas 38 y 48). La prueba dedicada falla. **Sugerencia para Antigravity:** quitar esos accesos de la ruta presentada al jurado; conservar herramientas en sus entradas de desarrollo.
4. **P1 visual: escala pequeña a 1920×1080.** El lienzo se centra en ~896 px y deja amplios márgenes; la barra superior y los mensajes usan texto pequeño. A 1366×768 la cabina ocupa más área y el modal cabe sin recorte. Pixel art conservó proporción, sin personajes duplicados visibles en las capturas revisadas. Revisar jerarquía visual en pantalla de presentación.

## Alcance de las pruebas pendientes

- **Menú/Jornadas:** no existen en el commit base del worktree. Al activar el flag, Playwright exigirá iniciar Jornada 1 y 2, entrar al lobby, volver y no ver herramientas técnicas.
- **Habitaciones:** no hay movimiento ni puertas en `StationScene` del commit base; solo balizas y tecla E. La prueba pendiente pulsa WASD/flechas, verifica posición, consola, puerta, retorno y conservación de recursos/revisión. Al entregarse la escena, adaptar selectores visibles y recorrido de puerta sin introducir un estado de misión paralelo.
- **A1/A2:** las pruebas actuales son de navegador y fallan en un bloqueo real. No confundirlas con los recorridos directos del gateway que sí pasan. Cuando el juego cambie, ejecutarlas de nuevo contra la URL de esa versión y guardar las capturas/traces nuevas.
