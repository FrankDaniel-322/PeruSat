# Revisión UX/UI y plan de integración — Misión A

**Fuentes revisadas:** `docs/specs/GAME_SPEC.md`, `docs/specs/CONTRACTS_V3.md` y todos los archivos de `prototypes/ux-ui-standalone/` (`index.html`, `style.css`, `station.js`, `game.js`, `cabin.js`, `workshop.js` y tres PNG). El prototipo es una prueba visual independiente; la autoridad de misión del producto sigue en `MissionGateway` y el snapshot confirmado.

## Evaluación y reutilización

| Aporte del Rol 03 | Conservar o adaptar | Límite actual |
| --- | --- | --- |
| `assets/portada.png` | Portada o briefing React; identidad reconocible en la presentación. | Ilustración del equipo, no imagen satelital ni dato NASA. |
| `assets/cabina.png` | Fondo de sala/estación en React o textura Phaser, tras validar peso y legibilidad. | Personajes junto al satélite son operadores de una **consola virtual** terrestre; no hay astronauta a bordo. |
| `assets/descarga.png` | Referencia de composición para la transferencia, roles y reloj; pieza de apoyo visual. | El texto y tiempo dibujados son fijos; la UI debe superponer datos vivos. |
| `style.css` | Paleta azul `#01143b`, cian `#07d8f8`, ámbar `#ffb02e`, crema `#f6f5e4`; tarjetas, foco, estados, tipografía y `prefers-reduced-motion`. | El lienzo fijo de 1920×1080 escalado sirve para exhibición, pero Rol 04 debe adaptar la composición a navegador y accesibilidad. |
| `station.js` y `cabin.js` | Cabina, puestos, gato guía, checklist y mensajes breves por decisión. Extraer presentación y animación, con acciones tipadas. | `cabin.js` observa el objeto global `game` y avanza al compañero con `auto()`. |
| `workshop.js` | Puestos mapa, cámara, antena, análisis e informe; interacción de apuntar y transmitir como capa Phaser opcional. | Tiene otra ruta que descuenta recursos en `finishCapture`/`finishTransmission`; movimiento libre secundario. |
| `game.js` | Textos, secuencia A1/A2, elección Piura/Sullana, perfiles, vista de archivos y debrief como referencia UX. | Es un motor local mutable. No migrar `advance`, `canPlan`, `auto`, `discard`, `useful` ni `summary` como reglas del producto. |
| `index.html` | Referencia de montaje y flujo de prueba. | No sustituir las entradas Vite/React existentes. |

El trabajo visual sí enseña decisiones: perfiles con distintos MB/Wh/créditos, una ventana de contacto limitada, una captura nublada y un informe prudente. El gato explica la consecuencia. La imagen `descarga.png` representa con claridad el relevo Satélite→Base. El selector de rol actual inicia **un compañero automático en el mismo navegador**: no prueba cooperación remota, identidad, sala compartida ni sincronización. Las imágenes de río, mapa y captura son esquemáticas o ilustradas; deben decir **SIMULADO**. El enlace a GPM/IMERG en el briefing es contexto, no una muestra NASA integrada.

## Diferencias con el Documento Maestro v3

| Tema | Prototipo independiente / núcleo actual | Ajuste necesario |
| --- | --- | --- |
| Estado de misión | El ZIP usa `game.step`/`game.success`; el núcleo usaba `active/completed/failed`. | El tipo, validador y mocks locales se ajustaron a `ready/running/won/lost`. El estado autoritativo vendrá de Rol 02. |
| Acciones | ZIP usa nombres `request/plan/capture/order/send/review/next/report`; núcleo usa sobre `{actionId, actorRole, expectedRevision, type, payload}`. | El documento v3 enumera `type` con campos directos; para `SUBMIT_REPORT` pide `reportId` y el núcleo usa `finding`. Rol 01+02 deben acordar adaptación explícita antes de Supabase, manteniendo una sola interfaz `MissionGateway`. |
| Roles | `base/orbit` en ZIP. | `ground/satellite` en contratos y permisos. |
| Hallazgos | `possible` en ZIP. | `possible_flood` en v3; `normal` e `insufficient` coinciden. |
| Recursos | ZIP modifica energía, memoria, presupuesto y tiempo localmente; su taller tiene una segunda ruta de descuentos. El gateway de desarrollo usa costo fijo de 14 MB/12 Wh y no cobra perfil. | Rol 02 decide y valida costos, perfiles, contacto, inventario y presupuesto una sola vez en backend; Rol 04 muestra el snapshot confirmado. No se deben copiar los números del ZIP como verdad. |
| Secuencia | ZIP admite dos observaciones rutinarias y primer intento nublado en lluvia. La demo del gateway actual concluye con una sola y no resuelve replanificación. | Rol 02 implementa A1 con dos válidas y A2 con recuperación tras nubes; Rol 04 presenta ambos recorridos. |
| Informe | ZIP genera texto y éxito local; `SUBMIT_REPORT` v3 requiere `reportId`; el gateway de desarrollo usa `finding`. | Rol 02 define persistencia/evaluación e informe prudente. El diagnóstico local `won/lost` no acredita las condiciones A1/A2. |
| Procedencia | ZIP ofrece ilustración y un enlace GPM/IMERG. | Rol 06 entrega muestra real de precipitación con fuente, URL, fecha UTC, lugar, unidad, intervalo y limitaciones. Las capturas ópticas simuladas conservan `GAME_SIMULATION`; lluvia estimada no confirma una inundación. |
| Conexión | El contacto satelital del ZIP es un contador local y no hay red entre jugadores. | Distinguir `contactSeconds` (ventana simulada) de conexión Internet/Realtime y de espera/confirmación de acción. |

### Mapeo de interacciones a acciones v3

| Pantalla o gesto del ZIP | Acción canónica | Rol y confirmación esperada |
| --- | --- | --- |
| Elegir provincia/río y solicitar | `REQUEST_OBSERVATION {targetId}` | Base `ground`; observar fase `planning`, objetivo y revisión. |
| Elegir perfil | `APPROVE_PLAN {profileId}` | Satélite `satellite`; mostrar costo antes y perfil confirmado después. |
| Apuntar/disparar cámara | `CAPTURE_IMAGE {targetId}` | Satélite; mostrar `Observation` recibida con calidad/procedencia. La puntería es interacción visual, no cálculo de calidad. |
| Priorizar archivo | `REQUEST_TRANSMISSION {observationId}` | Base; esperar confirmación de solicitud. |
| Sintonizar/enviar | `TRANSMIT_IMAGE {observationId}` | Satélite; mostrar tiempo/energía restantes y `transmitted` confirmado. |
| Examinar y calificar | `CLASSIFY_IMAGE {observationId, finding}` | Base; `finding` pertenece a `normal/possible_flood/insufficient`. |
| Entregar informe | `SUBMIT_REPORT {reportId}` | Base; resultado `won/lost` y debrief autoritativos. La forma actual `payload.finding` requiere decisión Rol 01+02. |
| Reintentar misión | `RESET_MISSION` | Solo con permisos y política definida por Rol 02. |

`next` y descartar una imagen no tienen acción v3; no deben cambiar el snapshot desde la vista. Rol 02 debe decidir si hacen falta transiciones adicionales para A1/A2 y coordinar cualquier extensión incompatible con Rol 01. Los controles Phaser/React emiten intención; `createMissionStore(gateway).sendAction` gestiona espera, error, revisión y confirmación. `getSnapshot` carga la sala y `subscribe` actualiza ambos clientes. El store presenta exclusivamente snapshots confirmados.

## Plan mínimo de producto y responsables

| Prioridad | Entrega comprobable | Responsable |
| --- | --- | --- |
| P0 | Valores `status` v3 en tipo, validador, mocks y pruebas; diferencia de formato de acciones documentada. | Rol 01, realizado en esta revisión; coordinar el formato con Rol 02. |
| P0 | Crear/unirse a una sala, roles únicos, permisos, persistencia, Realtime, revisión/idempotencia y reconexión; reglas únicas A1/A2, costos de perfil, replanificación, informe y evaluación. | Rol 02. |
| P0 | Briefing/lobby, dos paneles Base y Satélite, objetivos/cola, perfiles, captura SIMULADA, bandeja, informe, HUD de fase/estado/recursos/contacto, estados de espera/error/conexión/confirmación. Consumir `MissionGateway`, sin descuentos locales. | Rol 04 con diseño de Rol 03. |
| P0 | Definir jerarquía visual y mensajes breves: por qué un perfil cabe o excede recursos, por qué una nube impide concluir, por qué una transmisión falla, y qué evidencia respalda el informe. | Rol 03; Rol 04 implementa. |
| P0 | Ficha de muestra IMERG real y límites; mientras no exista, tarjeta **DEMO / datos simulados**, sin valores atribuidos a NASA. | Rol 06 para fuente y verificación; Rol 04 para visualización. |
| P1 | Incorporar portada/cabina/descarga y versión liviana de sprites e iconos; animar transferencia solo tras confirmación. | Rol 05 prepara assets; Rol 03 valida; Rol 04 monta. |
| P1 | Estación interactiva, gato contextual, miniacciones de apuntar/antena y movimiento si no retrasa el flujo. | Roles 03/05 diseño y arte, Rol 04 React/Phaser. |
| Fuera de alcance | Migrar el motor global del ZIP, segundo estado de misión, presentar el compañero automático como multijugador, predicción de inundaciones, alertas reales a autoridades, Misión B. | Todos. El compañero automático solo puede quedar como respaldo offline claramente rotulado. |

### Secuencia de aceptación de la demo real

1. Abrir dos navegadores en la misma sala; asignar `ground` y `satellite`; comprobar conexión y revisión coincidente.
2. A1: Base pide Piura; Satélite compara perfiles, aprueba y captura; Base pide transmisión; Satélite transmite; Base clasifica. Repetir para una segunda observación válida; informe y evaluación visibles para ambos.
3. A2: captura inicial `cloudy`; Base identifica evidencia insuficiente; equipo replantea y consigue al menos una observación válida dentro de límites; informe prudente y evaluación visibles para ambos. Probar también falta de contacto/energía con explicación.
4. En ambas rutas, verificar que cada acción muestra pendiente, confirmación o error y que ningún cliente actualiza recursos hasta recibir snapshot confirmado. La desconexión de Internet y el fin del contacto simulado deben tener textos distintos.

**Rúbrica:** impacto se ve en la decisión de priorizar Piura y en el informe para un centro ficticio; creatividad en cooperación y arte de consola; validez en procedencia, incertidumbre óptica y reglas verificadas; relevancia NASA en la muestra IMERG trazable y su uso limitado como contexto; presentación en dos puestos, debrief y evidencias de ambos navegadores. Un enlace NASA por sí solo no acredita uso de datos reales. Para la entrega guardar captura de cada puesto, debrief A1/A2, ficha IMERG, pruebas y enlace del juego desplegado.
