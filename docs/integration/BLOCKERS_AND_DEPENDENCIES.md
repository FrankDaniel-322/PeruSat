# PERUSAT CREW: Operación El Niño
## Matriz de Dependencias y Registro de Bloqueos

> **Control de interfaces entre Roles 01, 02, 03, 04, 05 y 06**
> **Objetivo:** Garantizar avance simultáneo sin detenciones ni reescrituras cruzadas.

---

## 1. Mapa de Dependencias entre Roles

| Origen | Destino | Entregable Exacto | Estado Actual | Mitigación Temporal si se retrasa |
|---|---|---|:---:|---|
| **01** (Arq/Integración) | **02** (Mecánicas/DB) | Contratos canónicos v3 + interfaz Gateway | **LISTO** | Implementado en `src/contracts/mission.ts` y `MissionGateway.ts`. |
| **01** (Arq/Integración) | **04** (Frontend) | Tipos v3 + DevTools de integración | **LISTO** | DevTools operativas en `src/devtools/` para pruebas locales. |
| **01** (Arq/Integración) | **05** (Arte 2D) | Convención de rutas `/public/assets/` | **LISTO** | Documentado en Guía de Integración y de Desarrolladores. |
| **02** (Mecánicas/DB) | **01** (Integración) | Máquina de estados completa y tablas Supabase | *EN PROCESO* | Usar `DevMissionGateway` o `MockMissionGateway` en DevTools. |
| **02** (Mecánicas/DB) | **04** (Frontend) | Catálogo de errores y transiciones | *EN PROCESO* | Frontend usa estados previstos en `PLAYER_ACTION_MATRIX.md`. |
| **03** (UX/UI/Pitch) | **04** (Frontend) | Wireframes y microcopias finales | *EN PROCESO* | Frontend implementa layout funcional con Tailwind. |
| **03** (UX/UI/Pitch) | **05** (Arte 2D) | Guía de estilo y paleta espacial | *EN PROCESO* | Usar colores base espaciales (azul profundo, cian `#06b6d4`, ámbar `#f59e0b`). |
| **04** (Frontend) | **03** (UX/UI) | Pantallas navegables para validación de flujo | *EN PROCESO* | Validar flujo mediante el entorno DevTools. |
| **05** (Arte 2D) | **02/04** | Sprites de satélite e imágenes de observación | *PENDIENTE* | Se usan placeholders CSS y badges semánticos en UI. |
| **06** (NASA/QA) | **02/04** | Dataset normalizado NASA GPM/IMERG (Piura) | *EN PROCESO* | Utilizar muestra local JSON simulada etiquetada `DEMO`. |
| **06** (NASA/QA) | **03** (Pitch) | Citas verificadas y límites científicos | *EN PROCESO* | Aplicar directriz de "reporte prudente sin sobreafirmar". |

---

## 2. Registro Activo de Bloqueos y Estrategia de Desbloqueo

### Bloqueo B-01: `MockMissionGateway` inicial solo implementa `REQUEST_OBSERVATION`
- **Descripción:** El `MockMissionGateway` provisto por Codex en `src/core/MockMissionGateway.ts` lanza intencionalmente `NOT_IMPLEMENTED` para acciones como `APPROVE_PLAN`, `CAPTURE_IMAGE`, `TRANSMIT_IMAGE`, etc., a la espera de que el Rol 02 entregue el motor completo.
- **Impacto:** Si el Rol 04 o los evaluadores esperan probar el ciclo completo de la Misión A de principio a fin, quedarían bloqueados en `briefing`.
- **Solución y Mitigación (Rol 01 Apoyo):** `src/devtools/DevMissionGateway.ts` permite recorrer los escenarios didácticos localmente sin alterar `src/core/MockMissionGateway.ts`. Sus reglas son provisionales; el Rol 02 debe sustituirlas por validación y persistencia autorizadas en el backend.

### Bloqueo B-02: Acreditación de procedencia de imágenes y datos NASA
- **Descripción:** Las imágenes ópticas reales de satélite para inundaciones en Perú pueden demorar en ser procesadas o tener restricciones de redistribución.
- **Impacto:** Riesgo de usar imágenes no autorizadas o inventar datos y presentarlos erróneamente como oficiales.
- **Solución y Mitigación:** Toda imagen o dato en el prototipo que no provenga de un endpoint abierto verificado se rotula de forma obligatoria con la etiqueta visible **«SIMULADO»** o **«ILUSTRACIÓN DIDÁCTICA»**.

### Bloqueo B-03: Sincronización remota vs. Despliegue en condiciones offline
- **Descripción:** Durante presentaciones o evaluación ante el jurado, la conexión a internet puede fallar o Supabase Realtime puede tener latencia.
- **Impacto:** Falla total de la demo si depende exclusivamente de WebSockets remotos.
- **Solución y Mitigación:** Las demos actuales muestran dos operadores en una misma pestaña con estado en memoria. No sincronizan pestañas ni navegadores independientes. Ante una caída de red, el flujo local puede servir para explicar el prototipo, pero no reemplaza una partida compartida; esa capacidad depende de Supabase del Rol 02.
