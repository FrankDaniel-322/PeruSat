# PERUSAT CREW: Operación El Niño
## Guía de Desarrollo e Instrucciones de Integración

> **Manual práctico para el equipo de desarrollo (Roles 01, 02, 03, 04, 05, 06)**
> **Versión de Contrato:** `schemaVersion: 3`

---

## 1. Instalación y Puesta en Marcha

### Requisitos Previos
- **Node.js:** Versión 20 LTS o 22 LTS recomendada.
- **pnpm:** Versión 10.34.9, fijada en `packageManager` y `pnpm-lock.yaml`. Con Node.js 20 puede usarse `corepack pnpm` si el comando global apunta a otra versión.
- **Git:** Instalado en el sistema operativo.

### Instalación de Dependencias
```bash
# Clonar o ubicarse en la rama de trabajo
git checkout feat/integration-and-verification

# Instalar dependencias limpias
pnpm install --frozen-lockfile
```

### Ejecución del Servidor de Desarrollo
```bash
# Iniciar servidor Vite local
pnpm dev
```
La aplicación estará accesible por defecto en `http://localhost:5173`.

---

## 2. Cómo Consultar y Respetar los Contratos Canónicos

Todos los tipos, estructuras de datos y firmas de acción están centralizados en:
- `src/contracts/mission.ts`: Tipos canónicos del snapshot, observaciones, recursos y acciones (`schemaVersion: 3`).
- `src/contracts/validation.ts`: Validadores de tipo en tiempo de ejecución (`isMissionAction`, `isMissionSnapshot`, `isObservation`).

### Regla Fundamental
> **NO MODIFICAR `src/contracts/` directamente.**
> Si se identifica la necesidad de un nuevo campo o variante, debe plantearse mediante una propuesta formal de arquitectura al Rol 01.

### Ejemplo de Importación en Módulos de Frontend
```typescript
import type {
  MissionSnapshot,
  MissionAction,
  PlayerRole,
  Observation
} from '../contracts/mission';
import { isMissionAction } from '../contracts/validation';
```

---

## 3. Cómo Utilizar el `MissionGateway`

La capa de enlace `MissionGateway` (`src/core/MissionGateway.ts`) es el único canal oficial para despachar acciones y recibir actualizaciones.

### 3.1 Despacho de Acciones
```typescript
import type { MissionGateway } from '../core/MissionGateway';
import type { MissionAction } from '../contracts/mission';

async function executeCapture(gateway: MissionGateway, roomId: string, revision: number) {
  const action: MissionAction = {
    actionId: crypto.randomUUID(),      // ID único para idempotencia
    actorRole: 'satellite',              // Rol del jugador activo
    expectedRevision: revision,          // Control de concurrencia optimista
    type: 'CAPTURE_IMAGE',
    payload: {
      targetId: 'rio-piura'
    }
  };

  try {
    const confirmation = await gateway.dispatch(roomId, action);
    console.log('Acción confirmada:', confirmation.eventId, confirmation.snapshot);
  } catch (err) {
    if (err instanceof Error) {
      console.error('Error al despachar acción:', err.message);
    }
  }
}
```

### 3.2 Suscripción a Eventos y Cambios de Conexión
```typescript
const unsubscribe = gateway.subscribe(roomId, (event) => {
  if (event.kind === 'connection') {
    console.log('Estado de conexión:', event.state); // 'connected' | 'reconnecting' ...
  } else if (event.kind === 'confirmed') {
    console.log('Nuevo snapshot v3 recibido:', event.change.snapshot);
    // Actualizar estado local en Zustand o React
  }
});

// Al desmontar el componente:
// unsubscribe();
```

---

## 4. Cómo Integrar Componentes React (Rol 04)

Los componentes de interfaz deben ser puramente reactivos y no contener lógica de cálculo de reglas espaciales.

### Patrón Recomendado
```tsx
import React, { useState } from 'react';
import type { MissionSnapshot, PlayerRole } from '../../contracts/mission';
import type { MissionGateway } from '../../core/MissionGateway';

interface DashboardProps {
  snapshot: MissionSnapshot;
  role: PlayerRole;
  gateway: MissionGateway;
}

export const SatelliteCapturePanel: React.FC<DashboardProps> = ({ snapshot, role, gateway }) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canCapture = role === 'satellite'
    && snapshot.phase === 'capture'
    && snapshot.resources.energyWh >= 12
    && snapshot.resources.storageMb >= 14;

  const handleCapture = async () => {
    if (!canCapture || loading) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await gateway.dispatch(snapshot.roomId, {
        actionId: crypto.randomUUID(),
        actorRole: 'satellite',
        expectedRevision: snapshot.revision,
        type: 'CAPTURE_IMAGE',
        payload: { targetId: snapshot.selectedTargetId || 'rio-piura' }
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Error al ejecutar captura');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-slate-900 text-white rounded-lg border border-slate-800">
      <h3 className="font-bold text-cyan-400">Captura Óptica Simulada</h3>
      <p className="text-sm text-slate-300">
        Batería: {snapshot.resources.energyWh} Wh | Memoria: {snapshot.resources.storageMb} MB
      </p>

      {errorMsg && (
        <div className="text-amber-400 text-sm mt-2">{errorMsg}</div>
      )}

      <button
        onClick={handleCapture}
        disabled={!canCapture || loading}
        className="mt-3 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-medium rounded"
      >
        {loading ? 'Procesando captura...' : 'Ejecutar Captura (12 Wh)'}
      </button>
    </div>
  );
};
```

---

## 5. Cómo Integrar Eventos de Phaser (Rol 02)

Phaser 4 se ejecuta dentro de un canvas embebido en React. La comunicación debe ser estrictamente por suscripción de eventos unidireccionales.

### Reglas para Phaser
1. **Phaser escucha el estado:** La escena de Phaser recibe actualizaciones de posición orbital o eventos de captura suscribiéndose al store o eventos del gateway.
2. **Phaser notifica interacciones simples:** Si el usuario hace clic sobre un polígono geográfico de Piura en el canvas de Phaser, Phaser emite un callback (`onSelectTarget(targetId)`), delegando la creación y despacho de `MissionAction` a la capa React/Gateway.
3. **Phaser no contacta a Supabase directamente.**

---

## 6. Cómo Incorporar Recursos Visuales sin Romper Rutas (Rol 05)

Todos los activos estáticos (imágenes, iconos, fondos) se ubican bajo la carpeta pública `/public/assets/`.

### Estructura Recomendada
```
public/assets/
  ├── icons/
  │    ├── battery.svg
  │    ├── storage.svg
  │    └── signal.svg
  ├── maps/
  │    └── peru-piura-satellite.webp
  ├── observations/
  │    ├── piura-clear-simulated.webp
  │    ├── piura-cloudy-simulated.webp
  │    └── piura-corrupt-simulated.webp
  └── manifest.json
```

### Regla de Rutas Absolutas
En componentes React y escenas Phaser, siempre referencia activos con **rutas absolutas desde la raíz pública**:
```tsx
// Correcto:
<img src="/assets/icons/battery.svg" alt="Batería" />

// Incorrecto (se rompe al navegar o en rutas anidadas):
<img src="../../public/assets/icons/battery.svg" />
```

---

## 7. Ejecución de Pruebas y Preparación del Build

### Ejecución de Pruebas Unitarias y de Integración
```bash
# Ejecutar todas las pruebas con Vitest
pnpm test

# Modo interactivo / observador
pnpm test:watch
```

### Preparación del Build para Despliegue
```bash
# Compilar TypeScript y empaquetar con Vite
pnpm build
```
El resultado se generará en la carpeta `dist/`, listo para ser desplegado en Vercel, Cloudflare Pages o cualquier servidor estático.

---

## 8. Protocolo de Identificación y Reporte de Bloqueos

Si un desarrollador se encuentra con un impedimento técnico que excede el ámbito de sus archivos autorizados:

1. **Paso 1: Usar Mocks Tipados:** No detener el trabajo visual o de interfaz esperando que backend o base de datos estén listos. Consumir `MockMissionGateway` o datos de sustitución tipados.
2. **Paso 2: Registrar en `docs/integration/BLOCKERS_AND_DEPENDENCIES.md`:** Indicar:
   - Rol afectado.
   - Componente bloqueante.
   - Impacto en el hito (P0, P1, P2).
   - Solución temporal adoptada.
3. **Paso 3: Abrir Propuesta de Cambio:** No modificar `src/contracts/` de forma unilateral.
