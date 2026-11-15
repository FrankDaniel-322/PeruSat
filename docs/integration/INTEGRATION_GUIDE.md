# PERUSAT CREW: Operación El Niño
## Guía Canónica de Integración del Sistema (schemaVersion: 3)

> **Documento de referencia para arquitectura, integración y pruebas (Apoyo al Rol 01)**
> **Ámbito:** Misión A (Inundaciones en Piura, Perú).
> **Versión de Contrato:** `schemaVersion: 3` (Documento Maestro 2026).
> **Aviso de fidelidad:** Este proyecto es un simulador educativo cooperativo desarrollado para el reto *Space Mission Design Game* (NASA Space Apps Challenge 2026). No realiza control directo del satélite PerúSAT-1 ni emite alertas reales a organismos de protección civil (INDECI, COEN, SENAMHI).

---

## 1. Arquitectura de Componentes

El sistema se estructura en capas desacopladas con responsabilidades unidireccionales y aislamiento estricto de roles:

```
+-----------------------------------------------------------------------------------+
|                                  CAPA DE PRESENTACIÓN                             |
|                                                                                   |
|  +------------------------------------+   +------------------------------------+  |
|  |     Base CNOIS (GroundDashboard)   |   |   Consola Satélite (SatDashboard)  |  |
|  |             (React 19)             |   |             (React 19)             |  |
|  +-----------------+------------------+   +-----------------+------------------+  |
|                    |                                        |                     |
|                    +--------------------+-------------------+                     |
|                                         |                                         |
|                                         v                                         |
|                      +--------------------------------------+                     |
|                      |        Escena 2D (Phaser 4)          |                     |
|                      |  Órbita, visualización e indicadores |                     |
|                      +------------------+-------------------+                     |
+-----------------------------------------|-----------------------------------------+
                                          | Suscripción / Eventos
                                          v
+-----------------------------------------------------------------------------------+
|                             CAPA DE ESTADO Y CONTRATOS                            |
|                                                                                   |
|  +------------------------------------+   +------------------------------------+  |
|  |      Estado Local (Zustand 5)      |   |   Contratos Canónicos (v3)         |  |
|  |   Refleja snapshot autorizado      |   |   src/contracts/mission.ts         |  |
|  +-----------------+------------------+   +-----------------+------------------+  |
+--------------------|----------------------------------------|---------------------+
                     | Lectura reactiva                       | Tipos canónicos
                     v                                        v
+-----------------------------------------------------------------------------------+
|                              CAPA DE ENLACE (GATEWAY)                             |
|                                                                                   |
|                 +-------------------------------------------------+               |
|                 |        MissionGateway (src/core/)               |               |
|                 |  dispatch(), getSnapshot(), subscribe()         |               |
|                 +------------------------+------------------------+               |
+------------------------------------------|----------------------------------------+
                                           | Acciones validadas
                                           v
+-----------------------------------------------------------------------------------+
|                        CAPA DE PERSISTENCIA Y MULTIJUGADOR                        |
|                                                                                   |
|      +-----------------------+                    +-----------------------+       |
|      | Supabase PostgreSQL   |                    |   Supabase Realtime   |       |
|      | Tablas, RLS, RPC      |                    |   Notificación de     |       |
|      | Transiciones atómicas |                    |   cambios confirmados |       |
|      +-----------------------+                    +-----------------------+       |
+-----------------------------------------------------------------------------------+
```

### Principios de Arquitectura
1. **Contrato Único e Inmutable (`src/contracts/mission.ts`):** Todos los módulos importan tipos de la versión 3. No se permiten extensiones clandestinas ni definiciones paralelas.
2. **Autoridad Compartida Sincronizada:** Las acciones se validan y confirman en backend/gateway con `expectedRevision`. Ningún cliente altera recursos unilateralmente.
3. **Phaser como Representación Visual:** Phaser no es fuente de verdad de datos ni almacena reglas de negocio; recibe eventos visuales y proyecta animaciones y mapas según el estado dictado por Zustand.
4. **Desacoplamiento DevTools / Features:** Las herramientas de prueba de integración residen en `src/devtools/`, permitiendo verificar el ciclo completo sin contaminar ni bloquear las vistas finales en `src/features/`.

---

## 2. Flujo de Comunicación entre Jugadores

La partida cooperativa se desarrolla entre dos navegadores conectados a la misma sala (`roomId`):

```
BASE CNOIS (Ground)                                     SATÉLITE (Satellite)
        |                                                        |
   (01) | -- Crea sala / Espera operador --------------------->  | (Se une por joinCode)
        |                                                        |
   (02) | -- Consulta datos NASA IMERG (lluvia en Piura)         |
        | -- Envía REQUEST_OBSERVATION (targetId: "rio-piura")   |
        | -----------------------------------------------------> | (Recibe notificación de solicitud)
        |                                                        |
        |                                                   (03) | -- Revisa energía (100 Wh) y memoria (70 MB)
        |                                                        | -- Envía APPROVE_PLAN (profileId: "optico-submetrico")
        | <----------------------------------------------------- |
        |                                                        |
        |                                                   (04) | -- Ejecuta CAPTURE_IMAGE (targetId: "rio-piura")
        |                                                        |    Consume 12 Wh de batería y 14 MB almacenamiento
        |                                                        |    Genera metadatos (calidad, fecha UTC, procedencia)
        | <----------------------------------------------------- | (Snapshot actualizado con nueva observación)
        |                                                        |
   (05) | -- Analiza lista de observaciones                      |
        | -- Envía REQUEST_TRANSMISSION (obsId)                  |
        | -----------------------------------------------------> | (Recibe solicitud de bajada de datos)
        |                                                        |
        |                                                   (06) | -- Verifica ventana de contacto (contactSeconds)
        |                                                        | -- Envía TRANSMIT_IMAGE (obsId)
        |                                                        |    Consume 4 Wh y ceil((sizeMb * 8)/4) s de contacto
        | <----------------------------------------------------- | (Observación marcada como transmitted: true)
        |                                                        |
   (07) | -- Inspecciona calidad (valid / cloudy / corrupt)      |
        | -- Envía CLASSIFY_IMAGE (finding: "possible_flood")    |
        | -- Elabora informe de situación                        |
        | -- Envía SUBMIT_REPORT (finding)                       |
        | -----------------------------------------------------> | (Ambos ven estado de misión: 'completed')
        |                                                        |
   (08) | <======== FASE DE DEBRIEFING Y EVALUACIÓN ===========> | (Revisión de decisiones, recursos y lecciones)
```

> **Diferencia crítica entre "Contacto Satelital" e "Internet":**
> `contactSeconds` representa únicamente la **ventana física simulada** en la que el satélite orbita con línea de vista hacia la estación terrena CNOIS. Si `contactSeconds` llega a 0, la transmisión de archivos se bloquea temporalmente, pero los navegadores **continúan conectados** por Internet. Jamás debe cerrarse la sala ni abortar la aplicación por fin de ventana.

---

## 3. Acciones Permitidas por Rol

El contrato `MissionAction` define restricciones precisas de ejecución según `actorRole`:

| Tipo de Acción | Rol Autorizado | Payload Requerido | Efecto en Estado / Recursos |
|---|:---:|---|---|
| `REQUEST_OBSERVATION` | `ground` | `{ targetId: string }` | Registra el objetivo solicitado; transiciona la fase de `briefing` a `planning`. |
| `APPROVE_PLAN` | `satellite` | `{ profileId: string }` | Confirma el perfil operativo y consumo previsto; transiciona a `capture`. |
| `CAPTURE_IMAGE` | `satellite` | `{ targetId: string }` | Genera nueva `Observation`; descuenta 12 Wh de energía y espacio en memoria (`storageMb`). |
| `REQUEST_TRANSMISSION` | `ground` | `{ observationId: string }` | Solicita priorización de descarga para la imagen seleccionada. |
| `TRANSMIT_IMAGE` | `satellite` | `{ observationId: string }` | Marca `transmitted: true`; consume 4 Wh y `ceil((sizeMb * 8)/4)` s de contacto. |
| `CLASSIFY_IMAGE` | `ground` | `{ observationId: string, finding: Finding }` | Evalúa calidad y asigna diagnóstico preliminar (`normal`, `possible_flood`, `insufficient`). |
| `SUBMIT_REPORT` | `ground` | `{ finding: Finding }` | Concluye la misión con reporte de situación prudente; transiciona a `debrief`. |
| `RESET_MISSION` | `ground` \| `satellite` | `{}` | Reinicia la misión al estado inicial de briefing (solo en depuración o host). |

*Cualquier intento de un jugador de despachar una acción no asignada a su rol será rechazado de inmediato con error `INVALID_ACTION`.*

---

## 4. Entrada y Salida de Datos por Módulo

### 4.1 Módulo Base CNOIS (`src/features/ground/`)
- **Entradas:**
  - Contexto meteorológico NASA GPM/IMERG (lluvia estimada en mm/h o mm acumulados).
  - Snapshot de misión emitido por Zustand (`phase`, `resources`, `observations`).
  - Lista de observaciones transmitidas (`transmitted === true`) con metadatos de calidad.
- **Salidas:**
  - Acciones `REQUEST_OBSERVATION`, `REQUEST_TRANSMISSION`, `CLASSIFY_IMAGE`, `SUBMIT_REPORT`.
  - Informe final estructurado con procedencia, calidad de evidencia y nivel de incertidumbre.

### 4.2 Módulo Satélite (`src/features/satellite/`)
- **Entradas:**
  - Solicitudes de observación y transmisión provenientes de Base.
  - Telemetría simulada de recursos: `energyWh`, `storageMb`, `contactSeconds`.
  - Parámetros orbitales y de paso sobre zona de interés (Piura).
- **Salidas:**
  - Acciones `APPROVE_PLAN`, `CAPTURE_IMAGE`, `TRANSMIT_IMAGE`.
  - Reporte de incidentes técnicos (batería baja, nubosidad detectada, ventana agotada).

### 4.3 Módulo Visual 2D Phaser (`src/game/`)
- **Entradas:**
  - Suscripción a cambios de snapshot en Zustand (posición satelital, activación de disparo de cámara, descarga de haz de enlace).
- **Salidas:**
  - Eventos de interacción de interfaz hacia React (clic en región de mapa, confirmación visual de fin de animación). *Phaser no emite llamadas HTTP directas ni manipula Supabase*.

---

## 5. Estados de Carga, Error y Reconexión

Para evitar interfaces congeladas y frustración del usuario, el sistema maneja cuatro estados de conexión y códigos de error estándar:

### 5.1 Estados de Conexión (`ConnectionState`)
1. **`connecting`:** Estableciendo canal de sala con Supabase. Botones de acción en estado deshabilitado con spinner.
2. **`connected`:** Canal operativo. Acciones habilitadas según rol y fase.
3. **`reconnecting`:** Pérdida temporal de paquetes o desconexión transitoria. La interfaz despliega cintillo amigable: *«Reconectando con la sala cooperativa...»*. No se pierden datos en memoria local.
4. **`disconnected`:** Enlace finalizado o error fatal de transporte. Se presenta opción de volver a conectar con el mismo `roomId`.

### 5.2 Errores Canónicos (`MissionErrorCode`) y Respuestas Recomendadas

| Código de Error | Causa Raíz | Mensaje al Usuario (Didáctico) | Acción del Cliente |
|---|---|---|---|
| `INVALID_ACTION` | Rol incorrecto, fase inadecuada o falta de recursos. | *«Acción no permitida en esta fase o rol no autorizado.»* | No reintentar automáticamente; habilitar solo opciones válidas. |
| `REVISION_CONFLICT` | El otro jugador envió una acción concurrente que avanzó la revisión. | *«El estado de la misión ha cambiado. Actualizando datos...»* | Rehidratar snapshot mediante `getSnapshot()` y reevaluar. |
| `DUPLICATE_ACTION` | Reenvío de una acción con el mismo `actionId`. | *«La acción ya fue procesada anteriormente.»* | Ignorar error y utilizar el snapshot confirmado recibido. |
| `NOT_CONNECTED` | Intento de emitir acción sin conexión activa. | *«Sin conexión con el servidor. Reintentando...»* | Encolar o solicitar reconexión al usuario. |
| `TRANSPORT_ERROR` | Fallo de red HTTP/Websocket hacia backend. | *«Error de comunicación con el servicio de misión.»* | Intentar reconexión con retroceso exponencial (*exponential backoff*). |

---

## 6. Casos de Prueba Manuales

1. **CP-01 (Asignación exclusiva de roles):** Dos navegadores ingresan con el mismo `roomId`; el primero selecciona `ground` y el segundo `satellite`. Se verifica que no puedan duplicar rol.
2. **CP-02 (Aislamiento de permisos):** Desde la consola de Base se intenta forzar `CAPTURE_IMAGE`. El sistema rechaza la acción y no modifica recursos ni genera observaciones.
3. **CP-03 (Consumo de recursos en captura):** Satélite ejecuta captura con 100 Wh y 70 MB libres. Se verifica que `energyWh` disminuye a 88 Wh y `storageMb` a 56 MB.
4. **CP-04 (Control de ventana de contacto):** Satélite intenta transmitir imagen cuando `contactSeconds` es menor que el tiempo de transmisión calculado `ceil((sizeMb * 8)/4)`. La acción se bloquea con el mensaje: *«La ventana de comunicación es insuficiente para este archivo»*.
5. **CP-05 (Informe con evidencia insuficiente):** La Base recibe una imagen con calidad `cloudy` (nublada). El informe final no debe permitir diagnosticar "inundación confirmada", exigiendo seleccionar *«Información insuficiente: se requiere nueva pasada o verificación de campo»*.

---

## 7. Dependencias entre los Roles 01, 02 y 04

```
ROL 01 (Arquitectura / Integración)
  ├── Entrega contratos TypeScript v3 (`src/contracts/mission.ts`, `validation.ts`)
  ├── Entrega interfaz de Gateway (`src/core/MissionGateway.ts`)
  └── Entrega entorno de pruebas visuales (`src/devtools/`)
         │
         ├── Desbloquea ROL 02 (Mecánicas, Phaser y Persistencia)
         │     ├── Implementa `applyAction` y máquina de estados
         │     ├── Configura Supabase Realtime y RLS
         │     └── Emite eventos de animación en canvas Phaser
         │
         └── Desbloquea ROL 04 (Frontend e Interfaces)
               ├── Construye pantallas `GroundDashboard` y `SatelliteDashboard`
               ├── Conecta controles UI mediante `dispatch(action)`
               └── Muestra indicadores de telemetría y mensajes de error
```

---

## 8. Checklist para Comprobar la Demo

- [ ] **Compilación limpia:** `pnpm build` genera ambas entradas HTML sin errores de TypeScript.
- [ ] **Ejecución de pruebas:** `pnpm test` aprueba el 100% de tests unitarios y de integración.
- [ ] **Dos sesiones concurrentes:** Dos ventanas de navegador independientes interactúan en la misma sala sin desincronización.
- [ ] **Flujo completo A1 (Rutinario):** Solicitud -> Aprobación -> Captura -> Transmisión -> Informe emitido con éxito.
- [ ] **Flujo completo A2 (Incidente):** Imagen con nubosidad o archivo grande -> Negociación entre jugadores -> Reporte de incertidumbre con rigor científico.
- [ ] **Etiquetas de procedencia:** Todos los datos simulados muestran visiblemente la leyenda **«SIMULADO»**.
- [ ] **Aviso institucional:** Presente en pantallas e informes: *«Simulación educativa desarrollada para NASA Space Apps Challenge 2026. No constituye un sistema oficial de alerta»*.
