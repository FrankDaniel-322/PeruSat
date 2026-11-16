# QA de navegador de la versión de release

Versión probada: `release/nasa-space-apps-2026` desde el worktree aislado `D:\PROJECTS\PeruSat-release`, partiendo de `eadf2c8` (`feat/sprint-final-p0`). La suite anterior detectaba un bloqueo tras transmitir y una escena Phaser vacía; ambos recorridos se volvieron a probar con navegador en esta versión. La suite remota de multijugador permanece separada en `multiplayer.acceptance.test.ts`.

## Ejecución

```powershell
# En el worktree de release: corepack pnpm dev --host 127.0.0.1 --port 4174
# En este worktree de QA:
$env:QA_GAME_URL='http://127.0.0.1:4174'
corepack pnpm exec playwright test --config scripts/qa/playwright.config.ts
```

En Windows, Playwright usa Edge. Las capturas están en `scripts/qa/artifacts/screenshots/`; los traces de errores se guardan en `scripts/qa/artifacts/results/`. Ambos directorios están ignorados por Git.

## Resultado del 16-11-2026

| Área | Resultado | Evidencia |
| --- | --- | --- |
| Menú, A1/A2, lobby y regreso | PASS | `menu-1366x768.png`, `menu-1920x1080.png` |
| Cambio de operador local y consola con E | PASS | Acciones de navegador y aserciones de texto |
| A1 completo: dos observaciones, clasificación e informe | PASS | `a1-informe.png`; clasificación accesible tras ambas transmisiones |
| A2: cobertura nubosa, evidencia insuficiente, nueva observación e informe | PASS | `a2-nubes-clasificacion.png`, `a2-informe.png` |
| Salas: movimiento, puerta, regreso y conservación de recursos | PASS | `sala-01-inicio.png`, `sala-02-puerta.png`, `sala-01-retorno.png` |
| Cabina y consola 1366×768 y 1920×1080 | PASS | `inicio-*`, `tooltip-*`, `consola-*`; modal dentro de pantalla |
| Supabase con dos sesiones reales | PENDIENTE | Faltan backend desplegado y credenciales públicas de prueba; no se ejecutó el smoke remoto |

Playwright: **10 PASS / 0 FAIL** contra el servidor de desarrollo del release. El menú y A1 completo también pasaron contra `vite preview` del build estático (**2 PASS / 0 FAIL**). Vitest en el release: **66 PASS / 0 FAIL**. Deno con PGlite local: **32 PASS / 0 FAIL**. Build: **PASS**. El servidor Supabase real no queda validado por estas pruebas locales.

El mundo explorable muestra los fondos integrados de Base CNOIS y Sala Satélite, con retorno a la Base. La suite verifica el movimiento, E y la conservación de recursos; las capturas permiten inspeccionar visualmente los fondos y la posición del personaje. No hay línea base aprobada para diferencias píxel a píxel. La escena usa una cámara acotada a la sala para que el fondo permanezca visible.

Para comprobar el artefacto de producción, ejecutar `corepack pnpm build` en el release, servirlo con `corepack pnpm exec vite preview --host 127.0.0.1 --port 4175` y repetir Playwright con `QA_GAME_URL=http://127.0.0.1:4175`.

Para el smoke remoto, seguir `scripts/qa/README.md` y usar únicamente sesiones de prueba y la clave pública `anon`. No publicar JWT ni usar credenciales `service_role` en el cliente.
