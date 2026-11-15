# QA de navegador de la rama integrada

Base probada: commit integrado local `860f225` de `feat/sprint-final-integration`, incorporado por rebase al worktree aislado `test/multiplayer-acceptance`. Incluye backend de Rol 02 y archivos gráficos de Rol 05. La rama `feat/sprint-final-integration` aún no estaba publicada y sus correcciones de Antigravity seguían sin confirmar al cerrar esta ejecución; se requiere repetir QA tras publicarlas. La suite multijugador previa permanece en `multiplayer.acceptance.test.ts`.

## Ejecución

```powershell
corepack pnpm exec playwright test --config scripts/qa/playwright.config.ts
corepack pnpm test
corepack pnpm build
```

Playwright usa Edge en Windows, inicia Vite en `127.0.0.1:4174` y conserva screenshot y trace de cada fallo en `scripts/qa/artifacts/results/`. Las capturas de comparación están en `scripts/qa/artifacts/screenshots/`. Ambos directorios están ignorados por Git. Se puede fijar `QA_GAME_URL` para probar un servidor de integración externo.

## Resultado del 15-11-2026

| Área | Resultado | Evidencia |
| --- | --- | --- |
| Menú, elección A1/A2, lobby y regreso | PASS | `menu-1366x768.png`; selector de escenario verificado en navegador |
| Cambio de rol local | PASS | Playwright alterna Base y PerúSAT-1 |
| Consola E en cabina | PASS | Abre y cierra solicitud de observación |
| DevTools fuera de la experiencia normal | PASS | No aparece como botón; sigue disponible mediante acceso de evaluador indicado en pie de página |
| A1, dos observaciones y dictamen | FAIL | Tras la primera transmisión, fase `downlink`; trace A1 |
| A2, nubes y dictamen | FAIL | Bloqueo tras la primera transmisión; trace A2. El dictamen no se alcanzó |
| Mundo explorable, movimiento, puertas y E | FAIL | Escena vacía; error del navegador `Phaser is not defined`; trace habitaciones |
| Cabina y modal 1366×768 | PASS | `inicio-*`, `tooltip-*`, `consola-*` |
| Cabina y modal 1920×1080 | PASS | `inicio-*`, `tooltip-*`, `consola-*` |
| Supabase con dos sesiones reales | PENDIENTE | No hay `QA_SUPABASE_URL` ni `QA_SUPABASE_ANON_KEY` de prueba; se conservaron las pruebas remotas |

Vitest: 64 PASS, 2 remotos omitidos. El comando `corepack pnpm test` termina FAIL porque Vitest intenta recoger `supabase/tests/backend.test.ts` y `supabase/tests/sql.test.ts`, que usan imports `jsr:` para Deno. Deno: 31 PASS, 1 FAIL (B14). Build: PASS. La compilación y las pruebas de reglas no sustituyen los recorridos de navegador fallidos.

## Bloqueos para integración

1. **P0, clasificación inaccesible.** `src/missions/flood/rules.ts` deja `phase = 'downlink'` después de `TRANSMIT_IMAGE` (línea 290) y solo establece `review` después de `CLASSIFY_IMAGE` (línea 304). `src/game/station/StationCanvas.tsx` abre el formulario de clasificación únicamente en `review` (línea 1115). La barra inferior sigue ofreciendo «Transmitir por Antena» después de confirmar la descarga. Rol 02 y Antigravity deben acordar la transición de fase y comprobar que A1 puede volver a `briefing` o iniciar otra observación tras clasificar, sin reiniciar recursos. No se aplicó parche al juego.
2. **P0, escena explorable vacía.** `src/integration/ExplorableWorldScene.ts` importa `Scene` pero usa `Phaser.Input.Keyboard.KeyCodes` en líneas 69–73 y `Phaser.Math` en líneas 448–449 y 504 sin importar el valor `Phaser`. El navegador lanza `Phaser is not defined`. Antigravity debe importar los símbolos de ejecución de Phaser o usar una importación de valor compatible; después repetir movimiento WASD/flechas, límites, puerta, retorno y E. Las dos respuestas 404 y «Texture key already in use: cabina» también aparecen en consola; verificar sus rutas y precarga al resolver el error principal.
3. **Fondos del Rol 05.** El commit integrado contiene cinco imágenes en `backgrounds/` y cuatro láminas en `icons/`. Se inspeccionaron los cinco fondos: Base CNOIS y Sala Satélite tienen perspectiva isométrica; Briefing, Debrief y lobby muestran vista superior. Las puertas tienen orientaciones distintas, por lo que se debe definir una transición de escena coherente antes de alinear colisiones. No hay referencias a `backgrounds/` ni `icons/` en `src/`; estas imágenes todavía no se renderizan en el juego. `public/assets/` contiene `portada.png`, `cabina.png` y `descarga.png`; el menú y la cabina muestran los dos primeros con proporción correcta y sin personajes duplicados evidentes. La escena explorable queda vacía por el error anterior y no puede recibir aprobación visual. Antigravity debe conectar los fondos al mundo Phaser y comprobar escala, perspectiva, puertas y posición del personaje.
4. **Puerta de tests tras integrar Supabase.** Rol 01/Rol 02 deben separar las suites Deno de Vitest en la configuración de test y ejecutar las primeras mediante `deno test` según `supabase/README.md`. El fallo actual es de recolección de módulos `jsr:`; no demuestra un fallo de lógica del backend.
5. **B14 Deno falla por coincidencia textual.** `supabase/tests/backend.test.ts` (líneas 479–497) rechaza cualquier archivo cliente que contenga la cadena `service_role`. `src/game/lobby/RoomLobbyModal.tsx` (línea 537) solo muestra una advertencia al usuario para que nunca ingrese esa clave. No hay clave privada en esa línea. Rol 02 debe comprobar uso real o valor secreto en lugar de prohibir la mención educativa; Antigravity puede revisar el texto visible. No se modificó ninguna de esas rutas.

Las capturas de 1366×768 y 1920×1080 muestran modal dentro de pantalla y pixel art sin distorsión evidente. A 1920×1080 el juego queda centrado en un ancho de ~896 px, con margen amplio y texto pequeño; revisar en el monitor de presentación. No hay línea base de diffs visuales aprobada: las capturas actuales permiten comparación manual y las pruebas geométricas no certifican legibilidad de texto renderizado en canvas.

Para ejecutar el smoke remoto, configurar las variables públicas de `scripts/qa/README.md` con sesiones de prueba y ejecutar en PowerShell `$env:QA_RUN_REMOTE='1'; corepack pnpm test`. No usar `service_role` ni publicar JWT.
