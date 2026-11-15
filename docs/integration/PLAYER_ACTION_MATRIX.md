# PERUSAT CREW: Operación El Niño
## Matriz Canónica de Acciones por Jugador (schemaVersion: 3)

> **Referencia obligatoria para validaciones en frontend (Rol 04), backend/reglas (Rol 02) y devtools**
> **Aviso importante:** Todos los recursos e identificadores de acción corresponden a `schemaVersion: 3`. No inventar nuevos tipos de acción ni alterar nombres de propiedades.

---

## 1. Resumen de Roles y Responsabilidades

| Rol (`actorRole`) | Nombre Didáctico | Puesto Operativo | Propósito en la Misión |
|---|---|---|---|
| `ground` | **Operador Base CNOIS** | Centro Nacional de Operaciones de Imágenes Satelitales (Tierra) | Revisa precipitación NASA IMERG, define objetivos prioritarios, solicita capturas, pide descargas y elabora el informe de situación. |
| `satellite` | **Operador Consola PerúSAT-1** | Consola virtual del segmento espacial | Evalúa viabilidad técnica, administra batería, memoria y enlace físico, aprueba planes, ejecuta capturas y transmite datos. |

---

## 2. Matriz Detallada de Acciones

### 2.1 Acciones del Jugador Base (`ground`)

#### `REQUEST_OBSERVATION`
- **Fase requerida:** `briefing`
- **Payload:** `{ targetId: string }` (ejemplo: `"rio-piura"`, `"valle-chira"`)
- **Precondiciones:**
  - `actorRole === 'ground'`
  - La sala se encuentra en fase `briefing`.
- **Efecto en recursos:** Ninguno (consume 0 Wh, 0 MB).
- **Transición de fase:** `briefing` → `planning`.
- **Registro en snapshot:** `selectedTargetId` asignado con `targetId`.
- **Posibles errores:**
  - `INVALID_ACTION`: Intento ejecutado por rol `satellite` o fuera de fase `briefing`. Mensaje: *«Solo la Base CNOIS puede solicitar la zona de observación durante el briefing inicial.»*

#### `REQUEST_TRANSMISSION`
- **Fase requerida:** `downlink` (o `capture` con al menos una observación lista)
- **Payload:** `{ observationId: string }`
- **Precondiciones:**
  - `actorRole === 'ground'`
  - Existe una observación con `observationId` en el snapshot.
  - La observación no ha sido transmitida aún (`transmitted === false`).
- **Efecto en recursos:** Ninguno directo en Base.
- **Transición de fase:** Mantiene o prepara fase `downlink`.
- **Posibles errores:**
  - `INVALID_ACTION`: La imagen especificada no existe o ya fue transmitida. Mensaje: *«El archivo solicitado ya se encuentra en la estación o no existe en la memoria del satélite.»*

#### `CLASSIFY_IMAGE`
- **Fase requerida:** `review`
- **Payload:** `{ observationId: string, finding: Finding }`
  - Valores válidos para `Finding`: `'normal'` | `'possible_flood'` | `'insufficient'`
- **Precondiciones:**
  - `actorRole === 'ground'`
  - La observación está transmitida (`transmitted === true`).
  - Si la calidad de la imagen es `cloudy`, `corrupt` o `incomplete`, el finding **no debe** ser `'possible_flood'` categórico sin advertencia de incertidumbre; la regla pedagógica orienta a clasificar `'insufficient'`.
- **Efecto en recursos:** Ninguno.
- **Posibles errores:**
  - `INVALID_ACTION`: Clasificación de un archivo no descargado aún. Mensaje: *«No se puede clasificar una imagen que no ha completado su transmisión a Tierra.»*

#### `SUBMIT_REPORT`
- **Fase requerida:** `review`
- **Payload:** `{ finding: Finding }`
- **Precondiciones:**
  - `actorRole === 'ground'`
  - Se ha evaluado al menos una observación transmitida.
- **Efecto en recursos:** Ninguno.
- **Transición de fase:** `review` → `debrief`.
- **Estado de misión resultante:** `status: 'completed'`.
- **Posibles errores:**
  - `INVALID_ACTION`: Intento de enviar informe sin observaciones o por el satélite. Mensaje: *«Solo la Base puede emitir el informe final de situación una vez revisadas las evidencias.»*

---

### 2.2 Acciones del Jugador Satélite (`satellite`)

#### `APPROVE_PLAN`
- **Fase requerida:** `planning`
- **Payload:** `{ profileId: string }` (ejemplo: `"optico-submetrico"`, `"optico-rapido"`)
- **Precondiciones:**
  - `actorRole === 'satellite'`
  - `resources.energyWh >= 12`
  - `resources.storageMb >= 14`
- **Efecto en recursos:** Valida viabilidad del perfil.
- **Transición de fase:** `planning` → `capture`.
- **Registro en snapshot:** `selectedProfileId` asignado con `profileId`.
- **Posibles errores:**
  - `INVALID_ACTION`: Recursos insuficientes para el perfil o ejecutado por `ground`. Mensaje: *«Energía o memoria insuficiente para comprometer este perfil de observación.»*

#### `CAPTURE_IMAGE`
- **Fase requerida:** `capture`
- **Payload:** `{ targetId: string }`
- **Precondiciones:**
  - `actorRole === 'satellite'`
  - `resources.energyWh >= 12` (consumo de captura)
  - `resources.storageMb >= 14` (almacenamiento libre requerido)
- **Efecto en recursos:**
  - `resources.energyWh` se reduce en 12 Wh.
  - `resources.storageMb` se reduce en 14 MB (o el tamaño según perfil: 9 MB comprimida, 28 MB detallada).
- **Generación de observación:** Crea un nuevo objeto `Observation` con:
  - `observationId`: identificador único simulado (ej. `"obs-piura-01"`).
  - `quality`: `'valid'` (o `'cloudy'` / `'corrupt'` en escenario de incidente).
  - `sizeMb`: 14 (o según perfil).
  - `capturedAtUtc`: timestamp ISO UTC actual.
  - `isSimulated`: `true`.
  - `sourceProvider`: `'GAME_SIMULATION'` (o `'NASA'` / `'CONIDA'` si usa muestra real referenciada).
  - `transmitted`: `false`.
- **Transición de fase:** `capture` → `downlink`.
- **Posibles errores:**
  - `INVALID_ACTION`: Batería baja (`energyWh < 12`). Mensaje: *«Energía insuficiente para realizar la captura óptica. Se requiere recarga solar.»*
  - `INVALID_ACTION`: Memoria llena (`storageMb < 14`). Mensaje: *«Memoria interna insuficiente. Se requiere transmitir o liberar espacio.»*

#### `TRANSMIT_IMAGE`
- **Fase requerida:** `downlink`
- **Payload:** `{ observationId: string }`
- **Precondiciones:**
  - `actorRole === 'satellite'`
  - La observación existe y `transmitted === false`.
  - `resources.energyWh >= 4` (consumo de transmisor de banda X)
  - `resources.contactSeconds >= ceil((sizeMb * 8) / 4)` (tiempo de pase simulado a 4 Mb/s)
- **Efecto en recursos:**
  - `resources.energyWh` se reduce en 4 Wh.
  - `resources.contactSeconds` se reduce en el tiempo consumido de transmisión.
  - La observación actualiza `transmitted = true`.
- **Transición de fase:** `downlink` → `review` (cuando se completa la descarga de las observaciones prioritarias).
- **Posibles errores:**
  - `INVALID_ACTION`: Ventana de paso insuficiente. Mensaje: *«La ventana de comunicación física ha terminado antes de completar la descarga.»*
  - `INVALID_ACTION`: Energía insuficiente para transmisión. Mensaje: *«Energía insuficiente para activar el transmisor de bajada de datos.»*

---

### 2.3 Acciones Comunes / Administrativas

#### `RESET_MISSION`
- **Fase requerida:** Cualquiera (en depuración o al reiniciar tras debriefing).
- **Payload:** `{}`
- **Precondiciones:** Autorizado para propósitos de prueba o por el anfitrión de la sala.
- **Efecto en recursos:** Restaura el snapshot a sus valores iniciales de `briefing` con `revision: 0` y lista de observaciones vacía.
- **Transición de fase:** Regresa a `briefing`.

---

## 3. Matriz Rápida de Autorizaciones

| Tipo de Acción | `ground` | `satellite` | Fase Válida | Costo Energía | Costo Memoria | Costo Contacto |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `REQUEST_OBSERVATION` | **SÍ** | NO | `briefing` | 0 Wh | 0 MB | 0 s |
| `APPROVE_PLAN` | NO | **SÍ** | `planning` | 0 Wh | 0 MB | 0 s |
| `CAPTURE_IMAGE` | NO | **SÍ** | `capture` | 12 Wh | 14 MB | 0 s |
| `REQUEST_TRANSMISSION` | **SÍ** | NO | `downlink` | 0 Wh | 0 MB | 0 s |
| `TRANSMIT_IMAGE` | NO | **SÍ** | `downlink` | 4 Wh | 0 MB | ~28 s |
| `CLASSIFY_IMAGE` | **SÍ** | NO | `review` | 0 Wh | 0 MB | 0 s |
| `SUBMIT_REPORT` | **SÍ** | NO | `review` | 0 Wh | 0 MB | 0 s |
| `RESET_MISSION` | **SÍ** | **SÍ** | Cualquier | Reset | Reset | Reset |

---

## 4. Política de Mensajes Didácticos y Microcopias

1. **Claridad sobre términos técnicos:** Evitar jergas herméticas. Usar *«Energía insuficiente»* en lugar de *«Subtensión en bus de potencia EPS»*. Usar *«Ventana de comunicación cerrada»* en lugar de *«AOS/LOS expirado»*.
2. **Distinción inequívoca de datos:**
   - Dato meteorológico real: *«Dato NASA IMERG: precipitación estimada; no confirma por sí solo zonas inundadas.»*
   - Imágenes de captura: *«Imagen demostrativa / simulada para fines pedagógicos.»*
   - Diagnóstico: *«Posible afectación; requiere verificación con brigadas en terreno.»*
3. **No simular llamadas de emergencia reales:** Ningún botón o mensaje debe sugerir contacto telefónico ni despacho de unidades de rescate a INDECI, COEN o Policía Nacional.
