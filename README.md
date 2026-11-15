# PERUSAT CREW · núcleo de integración

Base técnica de la Misión A (inundaciones en Piura). El proyecto parte de la estructura React + TypeScript + Vite y del mecanismo `EventBus` de la [plantilla oficial de Phaser](https://github.com/phaserjs/template-react-ts). Phaser se fija en `4.0.0`, la versión de esa plantilla al iniciar este núcleo.

## Ejecutar

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

Usar **pnpm 10.34.9** (fijado en `packageManager`) con Node.js 20.20.0. Si el comando global `pnpm` muestra otra versión, ejecutar los mismos comandos mediante `corepack pnpm`, que respeta la versión fijada. `pnpm-lock.yaml` es el único lockfile oficial. El build genera `index.html` y `role01-demo.html` en `dist/`.

La pantalla de inicio es una **demostración local**: dos stores independientes comparten un `MockMissionHub` dentro de un solo proceso de navegador. Al enviar `REQUEST_OBSERVATION` desde `ground`, ambos muestran la revisión 1 y la fase `planning`. No hay persistencia ni multijugador entre navegadores.

La demo de dos operadores está en `/role01-demo.html`. Usa el `DevMissionGateway` local y permite recorrer las secuencias rutinaria y nublada. Sus valores y observaciones llevan carácter didáctico; tampoco sincroniza navegadores distintos.

## Archivos principales

| Ruta | Función |
| --- | --- |
| `src/contracts/mission.ts` | Tipos canónicos v3 de Misión A |
| `src/contracts/validation.ts` | Validación en límites de entrada y salida |
| `src/core/MissionGateway.ts` | Interfaz de backend, eventos confirmados y errores |
| `src/core/MockMissionGateway.ts` | Transporte local e idempotencia para una transición |
| `src/store/missionStore.ts` | Store Zustand por cliente, reflejo de snapshots confirmados |
| `src/game/EventBus.ts` | Emisor compartido de la plantilla Phaser |
| `src/integration/missionBridge.ts` | Eventos tipados React–Phaser y limpieza de suscripciones |
| `src/integration/BridgeScene.ts` | Escena temporal de prueba del puente |
| `src/dev/IntegrationHarness.tsx` | Prueba visual local de dos clientes |

## Límites de integración

**Rol 02:** implementar reglas, inicialización de recursos, permisos, persistencia PostgreSQL, Auth, RLS y Realtime mediante una implementación de `MissionGateway`. `dispatch` debe validar `actorRole`, fase y `expectedRevision` en el backend, aplicar cada `actionId` una sola vez y emitir snapshots confirmados. La demo local solo implementa `REQUEST_OBSERVATION`; las demás acciones tipadas devuelven `NOT_IMPLEMENTED`. Los cinco recursos iniciales están en cero como marcadores, no como parámetros de PerúSAT-1.

**Rol 04:** reemplazar `IntegrationHarness` con las pantallas de ambos roles. Consumir el store y sus selectores; enviar `MissionAction` con `actionId` estable por reintento y `expectedRevision` del snapshot visible. Montar `PhaserGame` cuando corresponda y usar `missionBridge` para las interacciones visuales. Ninguna pantalla debe editar `snapshot.resources` ni atribuir autoridad multijugador a Zustand.

La lista de fases, calidad, hallazgos, acciones y propiedades del snapshot sigue el contrato v3 proporcionado. El texto recibido no enumera los valores de `status`; se conserva sin cambios la unión del commit base (`active | completed | failed`). Debe cotejarse con el Documento Maestro antes de conectar Supabase; no se hará un cambio incompatible unilateral. No se ha creado configuración ni clave de Supabase en el navegador.

El [traspaso al Rol 02 y Rol 04](docs/integration/ROLE02_SUPABASE_HANDOFF.md) detalla sala, autenticación, revisiones, idempotencia, RLS y reconexión. El backend todavía no está conectado.

Para publicar la rama de integración cuando el equipo facilite el remoto correcto, seguir la [guía GitHub](docs/integration/GITHUB_HANDOFF.md). No hacer merge directo a `main`.

## Verificación y avisos de dependencias

Con pnpm 10.34.9, `pnpm install --frozen-lockfile`, `pnpm test` (17/17) y `pnpm build` terminaron correctamente. El build incluye las dos entradas HTML. pnpm omitió el script de instalación de `esbuild@0.25.12`; Vite y Vitest funcionaron sin habilitarlo. `pnpm audit --prod` no detectó avisos. La auditoría completa señaló dos avisos críticos de `tinypool` y tres moderados de Vitest y `@vitest/mocker`, todos en dependencias de desarrollo. No exponer el servidor de desarrollo a la red; revisar la actualización de Vitest por separado, sin cambios forzados durante esta migración.
