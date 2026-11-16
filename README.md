# PERUSAT CREW: Operación El Niño

Videojuego educativo cooperativo para NASA Space Apps Challenge 2026. Dos operadores coordinan una misión simulada de observación de las cuencas del Piura y el Chira: **Base CNOIS** selecciona objetivos, pide la descarga y clasifica; **PerúSAT-1** configura el sensor, captura y transmite. El resultado depende de la evidencia y de los recursos disponibles.

**Alcance científico:** las imágenes, la lluvia de ejemplo, el tiempo de contacto, la energía y el presupuesto son datos del simulador. El juego cita a NASA GPM/IMERG y CONIDA como referencias educativas; no consulta mediciones NASA en vivo, no controla PerúSAT-1 y no emite alertas reales al COEN.

## Iniciar en local

Requisitos: Node.js **22.x** y pnpm **10.34.9** mediante Corepack.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Abrir `http://localhost:5173/`. La portada permite iniciar A1 (rutina) o A2 (nubes). El modo local funciona sin Supabase y permite alternar los dos puestos desde la barra superior. Está identificado como **Modo Local**; no representa dos personas conectadas.

## Controles y reglas

- **Cabina:** hacer clic en la estación o usar el botón contextual `[E]` para abrir la consola de la fase actual. Cerrar con `✕`.
- **Mundo explorable:** mover con `WASD` o flechas, acercarse a una consola y pulsar `E` o hacer clic. Las puertas conectan salas; el estado de misión y sus recursos deben conservarse al cambiar de sala.
- **Base CNOIS:** avanzar por la consola geográfica hasta elegir Río Piura o Río Chira y solicitar observación. Tras la captura, autorizar la telemetría, clasificar la imagen recibida y emitir el informe.
- **PerúSAT-1:** escoger un perfil de resolución, aprobar el plan, disparar el sensor NAOMI y sintonizar la Banda X a 8,20 GHz para transmitir.
- **A1:** corroborar dos observaciones útiles de cuencas distintas antes del informe. **A2:** una imagen cubierta por nubes exige clasificarla como evidencia insuficiente y replantear la observación; no se debe afirmar una inundación a partir de esa imagen.

Energía, almacenamiento, presupuesto y segundos de contacto son limitados. Una acción fuera de fase, rol o presupuesto de recursos puede ser rechazada. El informe y el dictamen son **simulados**.

## Tecnología y arquitectura

React 19, Phaser 4, TypeScript, Vite, Tailwind CSS, Zustand 5 y pnpm. El contrato de misión compartido usa `schemaVersion: 3`. `MissionGateway` es la interfaz del estado; `DevMissionGateway` sirve a la demostración local y `SupabaseMissionGateway` a salas remotas cuando el backend está configurado. Las acciones llevan `actionId` y `expectedRevision` para idempotencia y control de concurrencia.

El frontend estático no incluye un servidor Supabase desplegado. El backend, sus migraciones y pruebas están en `supabase/`; sus instrucciones están en [supabase/README.md](supabase/README.md). La conexión remota requiere un proyecto configurado, funciones desplegadas y las pruebas de humo reales. No se debe presentar la demo local como multijugador remoto.

## Pruebas y build

```powershell
corepack pnpm test
corepack pnpm build
deno test --config supabase/deno.json --allow-read --allow-env --allow-sys supabase/tests/
```

`pnpm test` ejecuta Vitest del frontend y el motor; las pruebas Deno del backend se ejecutan aparte. El build genera `dist/` con `index.html`, los recursos públicos y las entradas de desarrollo `devtools.html` y `role01-demo.html`. Estas entradas son herramientas de evaluación, no rutas de la experiencia principal.

## Desplegar el frontend en Vercel Hobby

1. Importar [FrankDaniel-322/PeruSat](https://github.com/FrankDaniel-322/PeruSat) en Vercel y seleccionar la rama estable publicada.
2. **Root Directory:** raíz del repositorio. **Framework Preset:** Vite. **Install Command:** `pnpm install --frozen-lockfile`. **Build Command:** `pnpm build`. **Output Directory:** `dist`. **Node.js:** 22.x. `vercel.json` fija framework, build y salida para evitar diferencias entre proyectos.
3. Para la **demo local pública**, dejar sin definir las variables de Supabase. La página cargará en Modo Local y no necesita backend.
4. Para activar salas remotas, definir en *Environment Variables* `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los valores públicos del proyecto; desplegar antes las migraciones y Edge Functions indicadas en `supabase/README.md`, habilitar las sesiones anónimas y ejecutar el smoke real con dos navegadores. Volver a desplegar después de cambiar variables. **Nunca** añadir `service_role`, JWT privados ni archivos `.env` al repositorio o a variables `VITE_`.
5. Abrir la URL de Vercel y comprobar portada, assets, A1 completo y consola del navegador. El proyecto usa archivos HTML estáticos y no requiere rewrite de SPA para las rutas actuales.

Vercel [documenta el preset de Vite](https://vercel.com/docs/frameworks/frontend/vite), [la configuración de build](https://vercel.com/docs/builds/configure-a-build) y [la versión de Node](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Fuentes y créditos

- [NASA GPM/IMERG](https://gpm.nasa.gov/data/visualization): referencia sobre estimaciones de precipitación multisatélite. Los valores numéricos del juego son hipotéticos.
- [CONIDA / PerúSAT-1](https://www.conida.gob.pe/post/per%C3%BAsat-1-capta-desastre-en-tacna): referencia sobre uso de imágenes satelitales en gestión del riesgo. Las capturas del juego son ilustraciones, no escenas satelitales reales.
- Arte y atribuciones del proyecto: [public/assets/README.md](public/assets/README.md). Los sprites y fondos se usan como ilustraciones del simulador.

El equipo utilizó herramientas de IA como apoyo para código, documentación y contenido visual o audiovisual. El material generado se revisa e integra como parte del prototipo; no se presenta como una medición científica ni como una captura de funcionalidad que todavía no esté implementada. Las limitaciones actuales y resultados de prueba se documentan en los reportes de QA del repositorio y deben actualizarse al publicar una nueva versión.
