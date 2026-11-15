# PERUSAT CREW: Operación El Niño
## Especificación Detallada de Escenarios de Prueba y Casos Borde

> **Documento de especificación de pruebas para QA, integración y validación técnica**
> **Versión de Contrato:** `schemaVersion: 3`

---

## 1. Escenario A1: Operación Rutinaria (Línea Base Exitosa)

### Objetivo
Validar que el flujo completo de observación, captura, transmisión y generación de informe se complete con éxito en condiciones normales sin incidentes en los recursos.

### Parámetros Iniciales de la Misión
- `missionId`: `'flood-piura-01'`
- `phase`: `'briefing'`
- `status`: `'active'`
- `revision`: `0`
- `resources`:
  - `energyWh`: 100 Wh
  - `storageMb`: 70 MB
  - `contactSeconds`: 80 s
  - `budgetCredits`: 100
  - `massKg`: 450 (referencial informativa de PerúSAT-1)
- `observations`: `[]`

### Pasos de Ejecución
1. **Paso 1 (Base - Briefing):**
   - El operador Base inspecciona el dato de contexto IMERG sobre Piura.
   - Despacha `REQUEST_OBSERVATION` con `payload: { targetId: 'rio-piura' }`.
   - *Resultado esperado:* Fase avanza a `'planning'`; `selectedTargetId` es `'rio-piura'`; `revision` incrementa a 1.
2. **Paso 2 (Satélite - Planning):**
   - El operador Satélite revisa la viabilidad energética y temporal.
   - Despacha `APPROVE_PLAN` con `payload: { profileId: 'optico-submetrico' }`.
   - *Resultado esperado:* Fase avanza a `'capture'`; `selectedProfileId` es `'optico-submetrico'`; `revision` incrementa a 2.
3. **Paso 3 (Satélite - Capture):**
   - El operador Satélite despacha `CAPTURE_IMAGE` con `payload: { targetId: 'rio-piura' }`.
   - *Resultado esperado:*
     - `energyWh` disminuye de 100 Wh a 88 Wh (-12 Wh).
     - `storageMb` disminuye de 70 MB a 56 MB (-14 MB).
     - Se crea una observación en `observations` con `quality: 'valid'`, `sizeMb: 14`, `transmitted: false`, `isSimulated: true`.
     - Fase avanza a `'downlink'`; `revision` incrementa a 3.
4. **Paso 4 (Base - Downlink Request):**
   - Base despacha `REQUEST_TRANSMISSION` con `payload: { observationId: 'obs-piura-01' }`.
   - *Resultado esperado:* Notificación recibida por Satélite; `revision` incrementa a 4.
5. **Paso 5 (Satélite - Transmit):**
   - Satélite despacha `TRANSMIT_IMAGE` con `payload: { observationId: 'obs-piura-01' }`.
   - *Resultado esperado:*
     - Tiempo de transmisión: `ceil((14 * 8) / 4) = 28` segundos.
     - `contactSeconds` disminuye de 80 s a 52 s (-28 s).
     - `energyWh` disminuye de 88 Wh a 84 Wh (-4 Wh).
     - La observación actualiza `transmitted = true`.
     - Fase avanza a `'review'`; `revision` incrementa a 5.
6. **Paso 6 (Base - Classify & Report):**
   - Base despacha `CLASSIFY_IMAGE` con `payload: { observationId: 'obs-piura-01', finding: 'possible_flood' }`.
   - Base despacha `SUBMIT_REPORT` con `payload: { finding: 'possible_flood' }`.
   - *Resultado esperado:*
     - Fase avanza a `'debrief'`; `status: 'completed'`.
     - Se registra informe simulado con evidencia trazable.
     - Puntaje educativo evaluado con puntuación alta (>90 pts).

---

## 2. Escenario A2: Incidente de Emergencia e Incertidumbre

### Objetivo
Verificar la capacidad del sistema y de los jugadores para responder ante una anomalía técnica o meteorológica (nubosidad o archivo corrupto), premiando la prudencia científica en el reporte final.

### Flujo del Incidente
1. **Generación de Imagen Afectada:**
   - Durante la captura, la imagen generada presenta `quality: 'cloudy'` o `quality: 'corrupt'`.
2. **Descarga y Descubrimiento:**
   - La imagen se transmite a Base CNOIS.
   - En la consola de Base, la imagen muestra visualmente una capa densa de nubes o franjas de corrupción digital.
3. **Coordinación y Decisión:**
   - La Base identifica que la evidencia óptica no permite verificar el nivel del cauce del río.
   - Si los recursos lo permiten, el Satélite puede sugerir una segunda captura en modo comprimido; si los recursos son escasos (`contactSeconds` o `energyWh` bajos), deben acordar cerrar la misión con la información disponible.
4. **Emisión de Reporte Prudente:**
   - Base despacha `CLASSIFY_IMAGE` con `finding: 'insufficient'`.
   - Base emite informe con limitations: *«Evidencia limitada por nubosidad severa. No se confirma inundación sin datos de campo complementarios»*.
   - *Resultado de evaluación didáctica:*
     - Si la Base clasifica `'insufficient'` con reporte prudente: **+30 pts en rigor y evidencia**.
     - Si la Base clasifica falsamente `'possible_flood'` o asegura desastre categórico sin ver el terreno: **0 pts en rigor científico por sobreafirmación**.

---

## 3. Pruebas de Casos Borde y Reglas Invariables

### CB-01: Batería Insuficiente (`energyWh < 12`)
- **Condición:** Estado con `energyWh: 8 Wh`.
- **Acción:** Satélite despacha `CAPTURE_IMAGE`.
- **Resultado esperado:** Lanzamiento de `INVALID_ACTION`. La energía se mantiene en 8 Wh (nunca negativa). Mensaje: *«Energía insuficiente para realizar la captura óptica»*.

### CB-02: Almacenamiento Insuficiente (`storageMb < 14`)
- **Condición:** Estado con `storageMb: 10 MB` libres.
- **Acción:** Satélite despacha `CAPTURE_IMAGE` (requiere 14 MB).
- **Resultado esperado:** Rechazo con `INVALID_ACTION`. Mensaje: *«Almacenamiento interno insuficiente para la nueva imagen»*.

### CB-03: Contacto Agotado (`contactSeconds < tiempo_transmision`)
- **Condición:** `contactSeconds: 15 s`. Tiempo requerido para transmitir archivo de 14 MB: 28 s.
- **Acción:** Satélite despacha `TRANSMIT_IMAGE`.
- **Resultado esperado:** Rechazo con `INVALID_ACTION`. Mensaje: *«La ventana de comunicación física ha terminado»*. La imagen no se marca como transmitida.

### CB-04: Segundo Jugador Desconectado
- **Condición:** Uno de los navegadores pierde conexión o cierra pestaña.
- **Resultado esperado:**
  - `ConnectionState` cambia a `'reconnecting'` o `'disconnected'`.
  - El jugador restante observa badge informativo amigable.
  - La sala no se destruye inmediatamente; permite reingreso del compañero usando el mismo `roomId`.

### CB-05: Acción Duplicada (Idempotencia)
- **Condición:** Se envía por duplicado una acción con el mismo `actionId`.
- **Resultado esperado:**
  - La segunda llamada retorna el resultado previamente confirmado sin volver a deducir energía, almacenamiento ni tiempo.
  - No se generan registros duplicados en el historial de eventos.

### CB-06: Acción Ejecutada por Rol Incorrecto
- **Condición:** Jugador con `actorRole: 'ground'` intenta despachar `CAPTURE_IMAGE`.
- **Resultado esperado:** Rechazo inmediato por validador/gateway con `INVALID_ACTION`. Mensaje: *«Solo el operador del Satélite puede ejecutar capturas de imagen»*.

### CB-07: Estado Desactualizado (`expectedRevision` obsoleto)
- **Condición:** El cliente envía acción con `expectedRevision: 1`, pero la revisión en el servidor ya avanzó a `2`.
- **Resultado esperado:** Rechazo con error `REVISION_CONFLICT`. El cliente refresca su snapshot local mediante `getSnapshot()` antes de permitir una nueva acción.

### CB-08: Ausencia o Caída de Datos NASA Reales
- **Condición:** Falla de red hacia servicios de NASA o retraso en descarga del producto IMERG.
- **Resultado esperado:**
  - El sistema utiliza automáticamente el dataset normalizado local preempaquetado.
  - Se rotula claramente en la interfaz: **«DATO DE SIMULACIÓN - MODO DE CONTINGENCIA»**, evitando cualquier confusión con mediciones operativas en vivo.
