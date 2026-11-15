# PERUSAT CREW: Operación El Niño
## Checklist de Pruebas Manuales para Demostración

> **Guía paso a paso para la verificación del prototipo previo a la entrega y evaluación**
> **Ámbito:** Misión A — Inundaciones en Piura
> **Roles requeridos:** 2 operadores simultáneos (Base CNOIS y Satélite PerúSAT-1)

---

## 1. Verificación Inicial de Entorno y Despliegue

| # | Elemento a Verificar | Procedimiento | Criterio de Éxito | Estado |
|---|---|---|---|:---:|
| 1.1 | Arranque local | Ejecutar `pnpm dev` en terminal. | Servidor inicia sin errores de compilación ni advertencias críticas. | [ ] |
| 1.2 | Construcción estática | Ejecutar `pnpm build`. | Ambas entradas HTML se generan en `/dist` con TypeScript validado. | [ ] |
| 1.3 | Suite de pruebas | Ejecutar `pnpm test`. | Todas las pruebas pasan en verde (100% éxito). | [ ] |
| 1.4 | Apertura de dos ventanas | Abrir dos navegadores (ej. Chrome normal e Incógnito) en la URL de la aplicación. | Ambas ventanas cargan limpiamente la pantalla inicial. | [ ] |

Las demos actuales comparten estado solo dentro de una misma pestaña. Dos ventanas abiertas no prueban sincronización remota; esa verificación queda pendiente del Rol 02.

---

## 2. Asignación y Control de Sala (Lobby)

| # | Elemento a Verificar | Procedimiento | Criterio de Éxito | Estado |
|---|---|---|---|:---:|
| 2.1 | Creación de sala | El Jugador 1 crea una sala para `flood-piura-01`. | Se genera un `roomId` válido y se asigna el rol `ground`. | [ ] |
| 2.2 | Unión con código | El Jugador 2 introduce el `roomId` o código de sala. | Se conecta satisfactoriamente y toma el rol `satellite`. | [ ] |
| 2.3 | Exclusión de roles | Intentar ingresar un tercer navegador con el mismo rol. | El sistema deniega la duplicación del rol activo. | [ ] |
| 2.4 | Visualización de presencia | Ambos jugadores observan el indicador de conexión. | Indicador verde con estado `connected` visible en ambas consolas. | [ ] |

---

## 3. Escenario A1: Misión Rutinaria (Flujo P0 Completo)

| # | Paso Operativo | Acción del Jugador | Resultado Esperado en Ambas Pantallas | Estado |
|---|---|---|---|:---:|
| 3.1 | Consulta de contexto | Base CNOIS revisa mapa y precipitación IMERG. | Se visualiza dato de precipitación (ej. 45 mm/h) con cita NASA y etiqueta explicativa. | [ ] |
| 3.2 | Solicitud de objetivo | Base CNOIS selecciona objetivo `"rio-piura"` y envía `REQUEST_OBSERVATION`. | Fase avanza a `planning`. La consola Satélite muestra la solicitud recibida. | [ ] |
| 3.3 | Aprobación técnica | Satélite evalúa batería (100 Wh) y memoria (70 MB); envía `APPROVE_PLAN`. | Fase avanza a `capture`. Base recibe confirmación de plan aceptado. | [ ] |
| 3.4 | Captura óptica | Satélite presiona «Ejecutar Captura». | Animación/indicador de captura. Batería desciende a 88 Wh (-12 Wh), memoria baja a 56 MB (-14 MB). Se genera observación con calidad `valid`. | [ ] |
| 3.5 | Petición de bajada | Base CNOIS selecciona la imagen en cola y pulsa «Solicitar Transmisión». | Satélite recibe alerta de imagen requerida por Tierra. | [ ] |
| 3.6 | Transmisión de datos | Satélite envía `TRANSMIT_IMAGE`. | Contacto simulado desciende en ~28 s; batería consume 4 Wh. La imagen se marca como `transmitted: true` y aparece en la bandeja de Base. | [ ] |
| 3.7 | Análisis y clasificación | Base CNOIS abre la imagen y asigna clasificación `possible_flood`. | Diagnóstico registrado con metadatos asociados. | [ ] |
| 3.8 | Emisión de informe | Base redacta informe y pulsa «Emitir Informe de Situación». | Informe generado con identificador único, evidencia citada y limitaciones. Fase pasa a `debrief`. | [ ] |
| 3.9 | Debriefing y evaluación | Ambos revisan el panel de resultados. | Puntaje didáctico desplegado (~100 pts) desglosando evidencia, ingeniería, colaboración, comunicación y eficiencia. | [ ] |

---

## 4. Escenario A2: Incidente de Emergencia y Manejo de Incertidumbre

| # | Elemento a Verificar | Procedimiento | Criterio de Éxito | Estado |
|---|---|---|---|:---:|
| 4.1 | Detección de anomalía | Se simula una captura con alta nubosidad (`quality: 'cloudy'`) o corrupta. | La imagen muestra artefactos de nubes o franjas de corrupción visual. | [ ] |
| 4.2 | Bloqueo de confirmación | Base CNOIS intenta marcar la imagen nublada como "Inundación Confirmada al 100%". | La interfaz advierte que la calidad no permite confirmación categórica y orienta a clasificar `insufficient`. | [ ] |
| 4.3 | Toma de decisión | Los jugadores coordinan solicitar una segunda pasada o redactar reporte prudente. | Se evidencia cooperación activa frente a restricciones reales. | [ ] |
| 4.4 | Redacción prudente | Base emite informe con limitations: *«Nubosidad parcial sobre el cauce del río Piura»*. | El informe emitido destaca la incertidumbre y recomienda validación de campo. | [ ] |

---

## 5. Pruebas de Límites de Recursos e Invariantes

| # | Prueba de Borde | Acción Ejecutada | Resultado Esperado | Estado |
|---|---|---|---|:---:|
| 5.1 | Batería insuficiente | Forzar consumo hasta que `energyWh < 12`; intentar `CAPTURE_IMAGE`. | Acción rechazada. Mensaje: *«Energía insuficiente para realizar la captura»*. La batería nunca queda en valores negativos. | [ ] |
| 5.2 | Memoria saturada | Reducir `storageMb < 14`; intentar captura. | Acción rechazada. Mensaje: *«Almacenamiento interno lleno»*. | [ ] |
| 5.3 | Ventana de contacto cerrada | `contactSeconds < tiempo_requerido`; intentar `TRANSMIT_IMAGE`. | Acción bloqueada. Mensaje: *«La ventana de comunicación física ha terminado»*. Los navegadores siguen conectados. | [ ] |
| 5.4 | Acción por rol incorrecto | Base intenta `CAPTURE_IMAGE` o Satélite intenta `REQUEST_OBSERVATION`. | Rechazo inmediato con error `INVALID_ACTION`. Ningún recurso se modifica. | [ ] |
| 5.5 | Desincronización de revisión | Enviar acción con `expectedRevision` antigua. | Rechazo con `REVISION_CONFLICT`; la interfaz refresca datos sin corromper la partida. | [ ] |

---

## 6. Verificación de Mensajería y Ética Científica

- [ ] Toda cifra, mapa o imagen de simulación cuenta con la etiqueta visible **«SIMULADO»**.
- [ ] No existen leyendas que afirmen emergencias reales ni contacto con el 112 / 911 / INDECI.
- [ ] La fuente de lluvia NASA GPM/IMERG incluye URL o identificador oficial accesible.
