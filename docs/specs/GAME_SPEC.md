# PERUSAT CREW — Operación El Niño

> **Documento Maestro de la Misión A / Prototipo 2026**
> Conversión del PDF original (18 páginas). Se conserva su redacción, sus tablas y sus contratos TypeScript v3.
> **Contrato canónico para el prototipo: `schemaVersion: 3`.**

---

<!-- Página original 1 de 18 -->

**SPACE APPS 2026 / MISIÓN 3 / ESPECIFICACIÓN DE CONSTRUCCIÓN**

**Misión A / inundaciones: SE IMPLEMENTA AHORA.**

**Misión B / incendios forestales: DOCUMENTADA, NO IMPLEMENTADA.**

Dos jugadores: Centro CNOIS virtual y consola de PerúSAT-1. Diseño → captura → transmisión → análisis → informe.

**Cinco criterios NASA · presupuesto de infraestructura S/ 0**

<!-- Página original 2 de 18 -->
**01 / DECISIÓN EJECUTIVA**

## Qué construir, qué no construir

Una sola experiencia completa, no dos sistemas inconexos.

**ACUERDO DE ALCANCE**

Hoy se implementa solo la Misión A: una sala cooperativa de dos jugadores para planificar una observación, ejecutar una captura simulada, transmitir datos, evaluar su calidad y producir un informe

**de situación. La Misión B permanece documentada como siguiente escenario del mismo motor.**

| P0 · Debe funcionar | P1 · Si queda tiempo | Fuera del prototipo |
| --- | --- | --- |
| Dos roles simultáneos: Satélite y Base | Pantallas más animadas | Control real de PerúSAT-1 |
| Una sala online / código para unirse | Sala ilustrada explorable | Predicción real de inundaciones |
| Dos casos: normal e incidente | Efectos y sonidos adicionales | Contactar a autoridades reales |
| Datos NASA identificados, trazables | Guardado/reingreso mejorado | Misión B jugable |
| Informe final y evaluación | Más objetivos geográficos | Órbitas de precisión / GMAT |

### Definición de éxito de la Misión 3

En dos navegadores diferentes, la Base solicita observar una zona del Perú; la consola Satélite confirma el plan, realiza una captura, selecciona qué archivo transmitir y ambos ven los cambios de energía, memoria, tiempo y evidencia. La Base clasifica la información y emite un reporte simulado con su fuente, limitaciones y resultado educativo.

**02 / PROBLEMA REAL**

## Necesidad, usuarios e impacto

El problema del mundo real da sentido a las decisiones espaciales, pero el entregable es un juego educativo.

### Necesidad contextual en el Perú

Las lluvias extremas relacionadas con episodios de El Niño pueden causar inundaciones e interrupciones en actividades e infraestructura. Obtener observaciones satelitales útiles demanda planificación, selección de zonas, calidad de imágenes, capacidad de comunicación y análisis. Los productos de precipitación de NASA ofrecen contexto; una imagen óptica aporta detalles visuales cuando las condiciones lo permiten. [S3-S5]

---

<!-- Página original 3 de 18 -->
### Problema educativo que sí resuelve el videojuego

Estudiantes interesados en ciencia y tecnología suelen aprender por separado conceptos como energía, datos, órbita, sensores y comunicaciones. Les falta experimentar cómo una decisión mejora un objetivo pero empeora otro. PERUSAT CREW convierte esas compensaciones en decisiones colaborativas y observables, de principio a fin. [S1-S2]

| Público | Necesidad | Beneficio previsto |
| --- | --- | --- |
| Principal | Estudiantes de secundaria superior, primeros ciclos universitarios y clubes STEM | Aprender misión espacial mediante decisiones y consecuencias. |
| Secundario | Docentes, divulgadores y participantes de talleres científicos | Usar una simulación breve como actividad guiada. |
| Indirecto / contexto | Ciudadanía interesada en gestión del riesgo y observación terrestre | Comprender el valor y los límites de datos satelitales; no recibe alertas operativas. |

### Impacto que sí podemos afirmar

- Inmediato: comprensión de conceptos de ingeniería espacial, colaboración y lectura crítica de información geoespacial.

- Demostrable en la demo: el jugador justifica una prioridad, administra recursos y distingue evidencia insuficiente de información utilizable.

- No prometemos: anticipar un desastre real, salvar vidas directamente, emitir alertas oficiales ni asesorar evacuaciones.

**03 / RIGOR CIENTÍFICO**

## Qué representa el juego y qué es una simulación

| Entidad / fuente | Función real | Representación en PERUSAT CREW |
| --- | --- | --- |
| CONIDA | Entidad espacial peruana. | Marco institucional de referencia, sin suplantación de identidad. |
| CNOIS | Programa, monitorea y opera PerúSAT-1 desde Tierra; gestiona acceso a imágenes de otros sensores. [S3] | Consola virtual de planificación, análisis y reportes. |
| PerúSAT-1 | Satélite óptico peruano, resolución submétrica (~70 cm pancromática). [S3] | Instrumento óptico de referencia; no sensor térmico ni predictor de inundaciones. |
| NASA GPM / IMERG | Estimaciones multisatélite de precipitación; distintas cadencias y unidades. [S5-S6] | Contexto verificable para priorizar un área; nunca confirmación automática de inundación. |
| Otros sensores | Observaciones ópticas o radar según disponibilidad / licencia. [S3] | Solo como referencias documentadas, no naves controlables en P0. |

**FIDELIDAD IMPORTANTE**

---

<!-- Página original 4 de 18 -->
No hay astronauta dentro del PerúSAT-1. El jugador Satélite usa una consola virtual que abstrae operaciones del segmento espacial. Las operaciones reales se dirigen desde Tierra. No se cambia físicamente la cámara de PerúSAT-1: el juego compara perfiles de adquisición y transmisión simulados. Si aparece diseño de hardware futuro, se rotulará como satélite educativo inspirado en PerúSAT-1.

### Cadena de evidencia admisible

Dato real NASA (por ejemplo, lluvia IMERG de un intervalo identificado) → prioridad de observación simulada → captura óptica demostrativa (imagen real autorizada o ilustración claramente marcada) → análisis educativo → informe simulado. La lluvia intensa no implica automáticamente que una calle específica esté inundada.

**04 / OBJETIVOS DEL JUEGO**

## Qué debe aprender y demostrar el jugador

| Objetivo formativo | Acción observable | Prueba en la demo |
| --- | --- | --- |
| Definir requisitos | Elegir zona y objetivo científico/operativo | Solicitud justificada en la consola Base. |
| Comparar decisiones de ingeniería | Priorizar calidad visual vs tamaño, energía y tiempo | Indicadores cambian y algunas opciones se bloquean. |
| Planificar operaciones | Aceptar plan y ventana de comunicación | Estado de misión avanza solo con validación de ambas partes. |
| Gestionar anomalías | Detectar nube/archivo inválido y replanificar | La misión puede terminar con evidencia parcial y explicación. |
| Comunicar límites | Emitir reporte con grado de incertidumbre | No se confirma inundación si no hay información suficiente. |
| Colaborar | Coordinar solicitudes y confirmaciones entre roles | Ambos clientes reciben estados coherentes. |

### Los cuatro segmentos NASA: conexión con el desafío

Lanzamiento: se muestra como contexto o ficha previa del satélite operativo, no se simula lanzamiento.

Espacial: PerúSAT-1 y observación. Terrestre: CNOIS, contacto y descarga. Usuario: análisis e informe para un centro de emergencias ficticio. Esta delimitación es intencional y explicable. [S2]

**05 / RÚBRICAS**

## Cómo alinear la solución con el jurado y con el desafío

### A. Cinco criterios generales de evaluación

---

<!-- Página original 5 de 18 -->
| Criterio | Qué mostrar con una evidencia concreta |
| --- | --- |
| IMPACTO | Problema peruano comprensible y aprendizaje verificable del diseño de misiones. |
| CREATIVIDAD | Dos jugadores con información y acciones complementarias; incidentes que alteran el plan. |
| VALIDEZ | Fuentes NASA citadas, procedencia de datos, límites ópticos, reglas coherentes y pruebas. |
| RELEVANCIA | Objetivo → requisitos → gestión de recursos → operación → informe y evaluación. |
| PRESENTACIÓN | Demo breve, texto claro, dos pantallas, URL abierta, explicación del antes y después. |

Los cinco criterios constan en la comunicación organizadora compartida. No deben confundirse con la puntuación interna del juego. [S8]

### B. Elementos del desafío Space Mission Design Game

| Elemento del reto | Implementación P0 | Nivel |
| --- | --- | --- |
| Definir objetivo y requisitos | Zona, necesidad de observar, calidad mínima | P0 |
| Diseñar/configurar misión | Perfil de captura y plan de transmisión | P0 |
| Masa, potencia, presupuesto, datos y comunicaciones | HUD con restricciones; masa/presupuesto como fichas de configuración | P0 |
| Cooperación y responsabilidades | Base y Satélite, dos clientes conectados | P0 |
| Simulación y evaluación | Normal / incidente, resultados comparables | P0 |
| Órbita / ventana de paso | Elección simplificada de ventana; no órbita calculada físicamente | P0 simplificado |
| Lanzador, hardware intercambiable, 3D y ranking | Explicados como posibles ampliaciones | P2 / fuera |

**CRITERIO DE PRIORIDAD**

Si hay que elegir entre un mapa bonito y una decisión que afecta realmente energía, tiempo y datos, primero va la decisión jugable. El desafío valora las compensaciones de ingeniería y el análisis posterior, no solo la navegación 2D. [S1]

**06 / MODOS Y DIFICULTAD**

## Misión A: dos escenarios del mismo sistema

| Escenario | Objetivo | Incidente y aprendizaje |
| --- | --- | --- |
| A1 · Práctica rutinaria | Solicitar, capturar y transmitir dos observaciones válidas. | Sin fallas inesperadas. Enseña el protocolo, los recursos y el informe. |

---

<!-- Página original 6 de 18 -->
| Escenario | Objetivo | Incidente y aprendizaje |
| --- | --- | --- |
| A2 · Alerta por lluvias | Priorizar una zona y obtener la mayor evidencia útil posible antes de perder contacto. | Nubes, archivo incompleto o tamaño excedido; cooperación y decisión bajo incertidumbre. |

### Condición de éxito y fallo

- A1: ambas observaciones llegan, tienen metadatos válidos y se genera informe; si falla, explicar qué recurso faltó.

- A2: se logra al menos una observación válida y un informe prudente; la puntuación sube si se obtiene evidencia adicional sin sobreafirmar.

- Fallo educativo: energía agotada, pérdida de ventana, transmisión cancelada, archivo inválido o informe que excede la evidencia. Siempre permitir reintentar.

### Incidentes candidatos (solo uno o dos para P0)

| Incidente | Efecto | Respuesta correcta |
| --- | --- | --- |
| Nubosidad | Captura con calidad limitada | Etiquetar insuficiente o replanificar; no «ver a través» de nubes. |
| Archivo demasiado grande | No cabe en tiempo de contacto | Priorizar otra imagen, comprimir o esperar siguiente ventana simulada. |
| Archivo corrupto | Integridad inválida | Solicitar retransmisión, no tratar como evidencia. |
| Batería baja | Captura bloqueada por regla | Usar modo de menor consumo o posponer operación. |

**07 / FLUJO COOPERATIVO**

## Una misión de principio a fin

01. Lobby: Host crea sala; segundo jugador entra por código; se asignan funciones ground y satellite.

02. Briefing: ambos ven zona, objetivo, criterio de éxito, fuentes y valores iniciales de recursos.

03. Base / objetivo: selecciona área de observación y registra motivo apoyado por dato NASA GPM/IMERG.

04. Satélite / revisión: acepta o rechaza un perfil de observación; ve energía, memoria y ventana disponible.

05. Base / priorización: elige qué áreas o productos son más útiles; confirma el orden de observaciones.

06. Satélite / captura: activa la simulación y genera observaciones con calidad, tamaño, fecha y procedencia.

07. Base / solicitud de envío: define qué archivo necesita primero; el satélite confirma.

08. Satélite / transmisión: consume tiempo de contacto y almacenamiento, envía los productos permitidos.

09. Base / análisis: valida calidad y compara productos con el dato de lluvia; clasifica: normal, posible afectación o insuficiente.

---

<!-- Página original 7 de 18 -->
10. Reporte y debrief: Base redacta informe simulado; ambos ven decisiones, gastos, incertidumbre y puntaje educativo.

**LÓGICA DEL ENLACE**

La conexión entre navegadores por Internet continúa activa mediante Supabase. La variable contactSeconds representa solamente la ventana física simulada de comunicación satelital. No desconectar la app cuando llegue a cero.

**08 / EXPERIENCIAS DISTINTAS**

## Qué hace cada jugador y cómo coopera

| Jugador Satélite · consola virtual | Jugador Base · centro CNOIS virtual |
| --- | --- |
| Recibe tareas de observación y revisa viabilidad. | Analiza precipitación, objetivos y prioridad territorial. |
| Confirma perfil de adquisición y calidad prevista. | Solicita área, prioridad y requerimiento de evidencia. |
| Captura archivos, administra energía y memoria. | Ordena qué producto debe transmitirse primero. |
| Ejecuta descarga dentro de la ventana simulada. | Valida calidad, metadatos y hallazgo prudente. |
| Reporta fallas técnicas y propuestas alternativas. | Genera informe simulado para un centro de emergencias ficticio. |

### Ejemplo de cooperación real dentro del juego

La Base pide dos imágenes. El Satélite informa que una imagen detallada consume la mayor parte de la ventana de contacto. Base prioriza la zona más relevante; Satélite selecciona el archivo y transmite. Una imagen llega con nubosidad: Base la marca como insuficiente y solicita otra toma. La evaluación premia la decisión bien justificada, no inventar certeza.

### Mensajes rápidos sugeridos

- Base: «Priorizar zona río» · «Solicitar imagen válida» · «Necesito metadatos»

- Satélite: «Plan aceptado» · «Batería insuficiente» · «Ventana de contacto: 40 s»

- Ambos: «Nueva revisión requerida» · «Archivo confirmado» · «Reporte listo»

**09 / PANTALLAS UX/UI**

## El mínimo visual que debe existir

| Vista | Componentes imprescindibles | Acción que valida |
| --- | --- | --- |
| Inicio / lobby | Crear sala, unirse por código, rol disponible, estado de conexión | Dos navegadores entran a la misma misión. |
| Briefing | Mapa de zona (puede ser esquemático), objetivo, fuente, criterios | Ambos reconocen qué deben conseguir. |

---

<!-- Página original 8 de 18 -->
| Vista | Componentes imprescindibles | Acción que valida |
| --- | --- | --- |
| Base CNOIS | Mapa, contexto IMERG, lista de objetivos, cola de solicitudes, bandeja de imágenes, reporte | Solicitar/validar observaciones y enviar informe. |
| Satélite | Visual 2D, objetivo, captura, batería, memoria, enlace, archivos, transmitir | Captura y transmite consumiendo recursos. |
| Debrief | Log de eventos, recursos usados, evidencias recibidas, resultado, reiniciar | Comparar una decisión y su consecuencia. |

### Dirección visual heredada de la propuesta UX/UI

Identidad espacial en tonos azules; cian para acciones, ámbar para alertas, siempre acompañados de texto/ícono; estación 2D como referencia, pero no bloquear P0 por desarrollar un mapa explorable. Los paneles y flujos provienen de la propuesta conceptual del equipo. [S7]

### Microcopys que deben estar claros

- «Dato NASA: lluvia estimada; no confirma inundación».

- «Imagen demostrativa / simulada» si no es una observación real con licencia.

- «Posible afectación; requiere verificación» en el informe simulado.

- «Sin contacto simulado» y «Internet desconectado» son estados diferentes.

**10 / REGLAS DE SIMULACIÓN**

## Números para el prototipo, no valores reales del satélite

**PARÁMETROS DE JUEGO**

**Los siguientes valores son hipotéticos y exclusivamente didácticos. No representan las**

prestaciones reales, batería, tasas de bajada de datos u órbita de PerúSAT-1. Deben mostrarse en una nota de la demo.

| Variable | Valor DEMO | Regla inicial |
| --- | --- | --- |
| energyWh | 100 Wh | Captura consume 12 Wh; transmisión consume 4 Wh por archivo. |
| storageMb | 70 MB libres | Una imagen ocupa 14 MB; detallada 28 MB; comprimida 9 MB. |
| contactSeconds | 80 segundos | El envío tarda ceil((sizeMb × 8)/4) segundos con 4 Mb/s simulados. |
| budgetCredits | 100 créditos | Los perfiles planificados tienen coste simulado de 10 o 20. |
| massKg | Masa fija informativa | No cambia por «equipar cámara»: PerúSAT-1 ya está construido. |

---

<!-- Página original 9 de 18 -->
| Variable | Valor DEMO | Regla inicial |
| --- | --- | --- |
| quality | valid / cloudy / corrupt / incomplete | Solo valid cuenta como observación útil, si proviene de fuente identificada. |

Ejemplo: enviar 14 MB a 4 Mb/s ocupa unos 28 s; un archivo de 28 MB requiere unos 56 s. Dos archivos grandes no caben en 80 s. Esto crea una compensación clara entre detalle y oportunidad de comunicar. Son reglas ficticias, pero las unidades son coherentes.

### Reglas invariables

- Ninguna acción puede hacer que energía, memoria o tiempo queden por debajo de cero.

- Ningún archivo inválido puede clasificarse como evidencia confirmatoria.

- La misma acción con el mismo ID no puede descontar recursos dos veces.

- Las decisiones de ambos clientes usan un estado autorizado y una revisión para evitar sobrescrituras.

- El puntaje se calcula a partir del historial validado, no desde la interfaz.

**11 / DATOS NASA**

## Qué descargar, cómo presentarlo y cómo citarlo

| Elemento | Fuente / formato | Uso en Misión A |
| --- | --- | --- |
| Lluvia estimada | NASA GPM/IMERG. Productos de tasa (mm/h) o acumulación (mm), con fecha, coordenadas, intervalo y versión. [S5-S6] | Seleccionar y justificar una zona prioritaria. |
| Imagen óptica | Imagen autorizada / recurso abierto claramente citado. Si no existe: ilustración marcada SIMULADA. | Analizar calidad y describir una posible observación. |
| Observación satelital peruana | CONIDA / PerúSAT-1 como referente científico; no asumir API pública ni licencias de redistribución. [S3-S4] | Inspirar decisiones y capacidades del sistema, no afirmar acceso directo. |
| Escenario de inundación | Situación didáctica creada para la demo | Reglas, incidente y resultados no se muestran como alerta oficial. |

### Regla de procedencia por archivo

Toda tarjeta de observación debe mostrar: origen (NASA/CONIDA/simulado), fecha UTC, zona, tipo, unidad si aplica, calidad, URL/cita y aviso de limitaciones. Nunca copiar un número arbitrario y rotularlo «dato NASA».

### Estrategia para no bloquear el prototipo

01. Obtener una muestra real y pequeña de IMERG sobre Perú con procedencia y unidad verificadas.

02. Preparar un JSON transformado de uso local (datos reales, normalizados) con referencia al archivo original.

03. Si la descarga se retrasa, usar un dato ficticio etiquetado DEMO para probar el flujo; sustituirlo por muestra NASA antes de presentar «uso de datos reales».

04. Usar imágenes ilustrativas libres/licenciadas para las capturas simuladas; registrar créditos de autoría.

---

<!-- Página original 10 de 18 -->
**12 / INFORME DE SITUACIÓN**

## Qué sale de la misión y a quién se envía

El destinatario dentro del juego es un centro de emergencias simulado, inspirado en flujos institucionales de atención y evaluación. No se envían comunicaciones reales a INDECI, COEN, SENAMHI ni a la población. El informe sirve para aprender a distinguir observación, inferencia e incertidumbre. [S4]

| Campo | Contenido mínimo |
| --- | --- |
| reportId / roomId | Identificadores únicos de informe y partida. |
| target / location | Área seleccionada, coordenadas aproximadas y nombre de región. |
| observedAtUtc | Fecha/hora de cada observación y del dato IMERG utilizado. |
| evidence[] | Lista de imágenes, calidad, tipo, fuente real/simulada, URL. |
| finding | normal \| possible flood \| insufficient evidence. _ _ |
| limitations | Nubosidad, resolución, falta de observación o falta de corroboración. |
| recommendedNextStep | Solicitar observación adicional o verificación técnica; no orden de evacuación. |
| generatedAtUtc | Marca de tiempo del informe simulado. |

**MODELO DE TEXTO DE INFORME**

«Se observó precipitación elevada en el producto satelital consultado. La imagen disponible presenta limitaciones por nubosidad. No es posible confirmar extensión de inundación con la evidencia actual. Se recomienda obtener observaciones complementarias y validar con información de campo».

**13 / STACK TÉCNICO**

## Arquitectura gratuita y responsabilidades

| Componente | Herramienta | Función y conexión |
| --- | --- | --- |
| Frontend | React + TypeScript + Tailwind | Pantallas Base, Satélite, lobby e informe; invoca acciones tipadas. |
| Game 2D | Phaser + TypeScript | Escenas visuales y animaciones; no es fuente única de datos. |
| Estado cliente | Zustand | Refleja el estado autorizado de misión; React/Phaser se suscriben. |
| Backend de datos | Supabase PostgreSQL + Auth anónimo + Realtime | Salas, roles, snapshots, eventos y avisos de actualización. |
| Validación | RPC SQL o Edge Function opcional | Aplica reglas atómicas por rol y controla revisiones. |

---

<!-- Página original 11 de 18 -->
| Componente | Herramienta | Función y conexión |
| --- | --- | --- |
| Hosting | Vercel (Hobby) o Cloudflare Pages Free | Distribuye frontend estático por URL; cuotas/condiciones gratis. |
| Colaboración | GitHub + GitHub Desktop | Ramas, PR, revisiones y fuente única de código. |
| AI y pruebas | Codex + Antigravity + Vitest | Ayudan a construir y probar; revisión humana obligatoria. |

### Cómo viaja una acción

React / Phaser emite una intención → servicio de misión TypeScript valida estructura → Supabase RPC/función segura verifica identidad, rol, reglas y revisión → PostgreSQL registra nuevo estado y evento → Realtime avisa a ambos clientes → Zustand actualiza el HUD. No confiar cambios definitivos de recursos al navegador.

### Cero gastos

Crear un proyecto en Supabase Free y desplegar en un servicio gratuito según sus condiciones. No comprar dominio, no habilitar complementos de pago y no depender de un servidor alojado en laptop. Mantener control de cuotas; una demo publicada no garantiza disponibilidad indefinida de un plan gratuito.

**14 / CONTRATOS COMPARTIDOS**

## Biblioteca canónica de tipos y variables

Todos los módulos importarán los tipos desde src/contracts/. No duplicar interfaces ni cambiar nombres sin una revisión de integración. Los valores no documentados se consideran inválidos.

```typescript
type PlayerRole = 'ground' | 'satellite';
type MissionId = 'flood-piura-01';
type MissionPhase =
  | 'briefing' | 'planning' | 'capture'
  | 'downlink' | 'review' | 'debrief';
type Quality = 'valid' | 'cloudy' | 'corrupt' | 'incomplete';
type Finding = 'normal' | 'possible_flood' | 'insufficient';

interface MissionResources {
  energyWh: number;
  storageMb: number;
  contactSeconds: number;
  budgetCredits: number;
  massKg: number; // informativa para PerúSAT-1 real
} interface Observation {
  observationId: string;
  targetId: string;
  quality: Quality;
  sizeMb: number;
  capturedAtUtc: string;
  isSimulated: boolean;
  sourceProvider: 'NASA' | 'CONIDA' | 'GAME_SIMULATION';
  sourceUrl?: string;
  transmitted: boolean;
}
```typescript
interface MissionSnapshot {
  schemaVersion: 3;
  roomId: string;
  missionId: MissionId;
  phase: MissionPhase;
  status: 'ready' | 'running' | 'won' | 'lost';
  revision: number;
  resources: MissionResources;
  observations: Observation[];
  selectedTargetId?: string;
  selectedProfileId?: string;
}
type MissionAction =
  | { type: 'REQUEST_OBSERVATION'; targetId: string }
  | { type: 'APPROVE_PLAN'; profileId: string }
  | { type: 'CAPTURE_IMAGE'; targetId: string }
  | { type: 'REQUEST_TRANSMISSION'; observationId: string }
  | { type: 'TRANSMIT_IMAGE'; observationId: string }
  | { type: 'CLASSIFY_IMAGE'; observationId: string;
      finding: Finding }
  | { type: 'SUBMIT_REPORT'; reportId: string }
  | { type: 'RESET_MISSION' };
```

### Convenciones obligatorias

Tipos PascalCase; variables camelCase; acciones UPPER_SNAKE_CASE; tiempo ISO 8601 UTC; energía Wh;

almacenamiento MB (megabytes); tasa de enlace Mb/s (megabits/segundo); recursos sin valores negativos.

schemaVersion: 3 es el contrato propuesto para este alcance y requiere que cualquier código anterior se actualice coordinadamente.

**15 / BACKEND Y MULTIJUGADOR**

## Modelo de datos mínimo en PostgreSQL

| Tabla | Qué contiene | Responsabilidad |
| --- | --- | --- |
| mission_rooms | id, joinCode, missionId, phase, createdAtUtc, status | Sala y acceso a la partida. |
| room_members | roomId, authUserId, role, joinedAtUtc | Dos identidades y roles únicos por sala. |
| mission_state | roomId, snapshot JSONB, revision, updatedAtUtc | Estado actual único y autorizado. |
| mission_events | eventId, roomId, actorId, action, result, revision | Auditoría y sincronización. |
| observations | observationId, roomId, quality, sizeMb, sourceProvider, isSimulated | Historial de capturas y transmisión. |
| mission_reports | reportId, roomId, finding, evidence JSONB, generatedAtUtc | Informe y resultado final. |

---

<!-- Página original 13 de 18 -->
### Seguridad y concurrencia

- Usar Supabase Auth anónimo o mecanismo equivalente que identifique de forma independiente a cada jugador.

- Activar Row Level Security (RLS): solo miembros leen la sala; únicamente cada rol ejecuta las acciones permitidas; ningún cliente puede modificar libremente la tabla de estado.

- Aplicar acciones mediante una ruta confiable (por ejemplo función SQL/RPC con validación exhaustiva o Edge Function); los cambios se confirman atómicamente por revisión.

- Cada evento utiliza eventId único y expectedRevision. Reintentos no deben duplicar energía consumida, transmisiones ni puntos.

- Realtime comunica cambios confirmados: presencia ≠ autorización. No poner claves secretas en el cliente.

### Plan de respaldo

Si Realtime falla, mantener modo demo guiado con un segundo operador simulado claramente identificado; si Supabase no responde, permitir ejecutar localmente la misión y emitir el informe con etiqueta de demo offline. No atribuir multijugador real a una simulación local.

**16 / FLUJO DE RESPONSABILIDADES**

## Qué entrega cada rol y cuándo debe integrarlo

| Rol | Primer entregable P0 | Dependencias que coordina |
| --- | --- | --- |
| 01 · Arquitectura e integración | Plantilla Phaser/React, contracts v3, servicio de acciones, build publicado | Coordina 02/04, merge PR, sincroniza módulos y prueba dos navegadores. |
| 02 · Mecánicas + infraestructura | Reglas A1/A2, Supabase tablas, aplicación de eventos, sala Realtime | Recibe contratos del 01; define acciones y resultados para el 04. |
| 03 · UX/UI + pitch | Flujos de dos jugadores, wireframes, microcopys, guion demo | Entregables a 04/05; recibe resultados/limitaciones de 02 y fuente 06. |
| 04 · Frontend e interfaces | Lobby, Base, Satélite, HUD, bandeja, informe | Recibe wireframes de 03 y contratos de 01; conecta a 02. |
| 05 · Arte 2D | Fondos livianos, iconos, imágenes de demo con etiquetas, estados visuales | Coordina formatos con 03/04; sin bloquear botones funcionales. |
| 06 · Datos NASA y verificación | Una ficha IMERG con fuente/unidad y 6 pruebas científicas | Entrega datos normalizados a 02/04 y revisión del informe a 03. |

### Avanzar en paralelo sin esperas innecesarias

01 prepara repositorio y tipos; 02 crea funciones de reglas con datos de prueba; 03 dibuja flujo y pitch; 04 construye componentes con mocks tipados; 05 exporta recursos; 06 verifica fuentes y casos de prueba.

Integrar primero la acción REQUEST_OBSERVATION y luego CAPTURE_IMAGE, no esperar a que todo esté perfecto.

**17 / REPOSITORIO Y AGENTES**

---

<!-- Página original 14 de 18 -->
## Estructura para GitHub, Codex y Antigravity

```text
perusat-crew/
  public/assets/          # arte optimizado y licencias
  src/app/                # React, routing, lobby
  src/game/               # escenas Phaser
  src/features/ground/    # pantalla Base
  src/features/satellite/ # pantalla Satélite
  src/missions/flood/     # A1 y A2, sin duplicar motor
  src/contracts/          # única fuente de tipos
  src/store/              # Zustand
  src/services/           # Supabase / game actions
  src/data/               # muestras NASA + procedencia
  supabase/               # migraciones y funciones
  tests/                  # reglas y flujo
  docs/                   # fuentes, GDD, rúbrica, pitch
```

### Asignación sugerida de tareas de IA

| Codex (cambios complejos) | Antigravity (trabajo iterativo) |
| --- | --- |
| Definir y revisar contratos compartidos + esquema de persistencia | Crear componentes React a partir de flujos UI acordados. |
| Implementar validación de eventos y concurrencia | Pantallas, estilos Tailwind, mensajes y estados vacíos. |
| Pruebas de invariantes, energía y permisos | Recursos visuales, documentación, consistencia de UX. |
| Revisar PR de integración crítica | Pruebas manuales, casos de error, ajustes de accesibilidad. |

**REGLA DE COLABORACIÓN**

Codex y Antigravity deben trabajar en ramas/worktrees diferentes, con archivos asignados y contratos v3 de solo lectura para tareas no autorizadas a cambiarlos. Integrar cambios pequeños vía PR.

No pedir a ambos que reescriban el mismo componente simultáneamente.

**18 / SPRINT DE CONSTRUCCIÓN**

## Orden exacto para pasar de idea a demo

| Orden | Implementación | Se considera listo cuando... |
| --- | --- | --- |
| P0-1 | Repositorio, dependencias, contratos compartidos | El proyecto compila y ejecuta React + Phaser en una laptop. |
| P0-2 | Lobby de dos roles con ID sala | Ambos clientes entran con roles distintos y ven estado de conexión. |
| P0-3 | Solicitar observación y aprobar plan | Acción Base aparece y se confirma en Satélite. |
| P0-4 | Captura + recursos + calidad | Cambian batería/memoria y se crea una observación reproducible. |

---

<!-- Página original 15 de 18 -->
| Orden | Implementación | Se considera listo cuando... |
| --- | --- | --- |
| P0-5 | Transmisión y ventanas | Transmite solo si hay capacidad y actualiza a los dos jugadores. |
| P0-6 | Validación + informe Base | Informe dice posible/insuficiente y cita procedencia. |
| P0-7 | A1 normal y A2 incidente | Se muestran dos resultados diferentes al jurado. |
| P0-8 | Deploy y pruebas cruzadas | Enlace público carga desde otra laptop y sin errores críticos. |

### Corte recomendado

Antes de mejorar animaciones, debe existir el recorrido Base solicita → Satélite captura → transmite → Base informa. Si el tiempo aprieta: prescindir del movimiento libre, catálogo de cuatro salas, multimisiones y mapas avanzados. La calidad de la integración pesa más que la cantidad de pantallas.

**19 / QA Y EVIDENCIAS**

## Lista de aceptación por funcionalidad

| Caso de prueba | Resultado esperado |
| --- | --- |
| Se crea una sala y entra un segundo navegador | Se asignan un ground y un satellite; no roles duplicados. |
| Base solicita zona / Satélite recibe solicitud | La misma solicitud aparece una vez en ambas sesiones. |
| Satélite captura imagen con recursos suficientes | Se descuenta energía y memoria; observación posee metadatos. |
| Satélite intenta capturar sin energía | Acción denegada con explicación; sin recursos negativos. |
| Se transmite archivo dentro del contacto | Archivo llega a bandeja Base y queda registrado. |
| Archivo excede contacto simulado | No se transmite; mensaje explica tamaño vs ventana. |
| Se retransmite una acción por error de red | eventId se detecta; no se duplica consumo ni resultado. |
| Imagen nublada o corrupta | Base no puede marcarla como evidencia concluyente. |
| Base emite informe sin imágenes válidas | La conclusión indica insuficiencia de evidencia. |
| La sala se refresca y reconecta | Se recupera la última revisión persistida. |
| Un usuario ajeno abre roomId | No lee ni modifica información de esa sala. |
| Vercel/hosting abre en una tercera laptop | URL carga y demo usa únicamente servicios gratuitos. |

### Evidencias para el jurado

Guardar una captura de la pantalla de ambos roles, otra del debrief, una muestra del JSON normalizado NASA con URL y unidad, el resultado de las pruebas, el repositorio GitHub y el enlace público. Preparar una descripción de qué hizo la IA y qué verificó el equipo.

---

<!-- Página original 16 de 18 -->
**20 / PUNTAJE INTERNO Y DEBRIEF**

## Convertir decisiones en aprendizaje

| Categoría del videojuego | Puntos sugeridos | Qué evalúa |
| --- | --- | --- |
| Evidencia y rigor | 30 | Calidad, trazabilidad, límites científicos y reporte prudente. |
| Decisiones de ingeniería | 25 | Uso razonado de recursos y perfiles; evitar acciones inviables. |
| Colaboración | 20 | Solicitudes, confirmaciones y decisiones conjuntas. |
| Comunicación | 15 | Transmisión correcta y metadatos completos. |
| Eficiencia | 10 | Uso de energía, memoria y tiempo sin desperdicio injustificado. |

Total sugerido: 100 puntos didácticos. Este puntaje no sustituye ni representa una calificación oficial del jurado. Mostrar siempre «qué decisión se tomó», «qué cambió», «qué se aprendió» y «qué se haría diferente».

### Ejemplos de retroalimentación

- «Priorizaste una imagen con menor tamaño: conseguiste transmitir antes del cierre de contacto, pero sacrificaste detalle».

- «La imagen óptica quedó limitada por nubes: tu decisión de reportar incertidumbre aumentó la confiabilidad».

- «Agotaste energía antes de la segunda captura: revisa el perfil de observación o la planificación de recursos».

**21 / DEMO Y PRESENTACIÓN**

## Secuencia corta para mostrar al jurado

01. Problema (15 s): las lluvias intensas requieren observaciones; el aprendizaje de misión espacial es complejo.

02. Solución (15 s): dos jugadores diseñan y ejecutan una operación satelital inspirada en CNOIS / PerúSAT-1.

03. Demostración A1 (45 s): solicitud, aprobación, captura, transmisión y dos observaciones válidas.

04. Demostración A2 (45 s): incidente de nubes o archivo grande; el equipo prioriza y reporta incertidumbre.

05. Ciencia + impacto (30 s): mostrar dato NASA GPM/IMERG, limitaciones y debrief educativo.

06. Cierre (15 s): ampliar en el futuro con la Misión B de incendios usando el mismo motor.

**PRESENTACIÓN Y ENTREGA**

---

<!-- Página original 17 de 18 -->
La sede solicitó un pitch en inglés y un video breve de 30 segundos, además del proyecto en la plataforma oficial. La demostración completa puede ser más larga; el video de 30 segundos debe condensar problema, solución y evidencia funcional. Verificar requisitos finales de la sede antes de enviar. [S8]

**22 / MISIÓN B**

## Incendios forestales — documentada, NO se desarrolla ahora

La Misión B será una expansión futura que reutiliza lobby, roles, motor de recursos, cola de observaciones, transmisión y reportes. No se deben asignar tareas de implementación a esta misión durante el corte principal de Misión 3.

| Componente futuro | Diseño para Misión B |
| --- | --- |
| Problema real | Observación de áreas potencialmente afectadas por incendios forestales en Perú. |
| Dato NASA | FIRMS con anomalías térmicas MODIS/VIIRS: fecha, ubicación, producto, incertidumbre. [S9] |
| Base virtual | Prioriza zonas con focos térmicos y solicita observación óptica complementaria. |
| PerúSAT-1 simulado | Planifica capturas y transmite productos si visibilidad y recursos lo permiten. |
| Informe | Posible afectación e incertidumbre; una anomalía térmica no confirma incendio forestal por sí sola. |
| Criterio de reuso | Nuevo missionId, nuevo dataset, nuevas reglas de calidad; los contratos de sala y transmisión permanecen. |

**NO AVANZAR ESTA MISIÓN**

Registrar ficha GDD, usuarios, fuente de datos y posibles incidentes, pero sin construir escenas,

**endpoints ni reglas específicas antes de terminar, probar y publicar Misión A.**

**23 / REFERENCIAS Y PROVENIENCIA**

## Fuentes para documentar y validar el proyecto

S1 · Desafío Space Mission Design Game Copia del enunciado oficial 2026 suministrada por el equipo y referencia pública de Challenge. — Abrir fuente [Enlace de fuente oficial](https://hackathlone.com/challenges/space-mission-design-game) S2 · NASA Design and Develop Science Missions Segmentos y proceso de ingeniería de misiones. — Abrir fuente [Enlace de fuente oficial](https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf)

**S3 · CNOIS / CONIDA Operación de PerúSAT-1 y acceso a otros sensores. — Abrir fuente**

[Enlace de fuente oficial](https://www.gob.pe/10396-comision-nacional-de-investigacion-y-desarrollo-aeroespacial-centro-nacional-de-operaciones-de-imagenes-satelitales) S4 · CONIDA / respuesta ante emergencias Uso de observaciones satelitales para atender desastres. — Abrir fuente [Enlace de fuente oficial](https://www.gob.pe/institucion/conida/noticias/1036613-atencion-a-emergencias-desde-el-espacio-tecnologia-satelital-para-la-gestion-de-desastres-en-peru)

**S5 · NASA GPM/IMERG Precipitación multisatélite, cadencias y formatos. — Abrir fuente**

[Enlace de fuente oficial](https://gpm.nasa.gov/data/imerg)

---

<!-- Página original 18 de 18 -->
S6 · NASA Precipitation Data Directory Resolución, formatos y unidades de productos. — Abrir fuente [Enlace de fuente oficial](https://gpm.nasa.gov/data/directory) S7 · Propuesta visual del equipo Archivo compartido «space app.pdf»: misión de inundación y flujos UX/UI. — Material suministrado por el equipo S8 · Correo y programa del evento Cinco criterios de evaluación; requisitos locales y cronograma recibidos. — Material suministrado por el equipo

**S9 · NASA FIRMS Datos de anomalías térmicas para Misión B futura. — Abrir fuente**

[Enlace de fuente oficial](https://firms.modaps.eosdis.nasa.gov/)

**S10 · NASA Space Apps 2026 Plataforma y cierre de envío. — Abrir fuente**

[Enlace de fuente oficial](https://www.spaceappschallenge.org/2026/)

### Supuestos y decisiones pendientes de verificación

- Los parámetros de consumo y transmisión son ficticios, no telemetría de PerúSAT-1.

- El caso geográfico preciso, intervalo y valor del dato NASA IMERG deben registrarse al descargar la muestra.

- Las imágenes ilustrativas requieren crédito o licencia; marcar todo contenido sintetizado.

- Los nombres CONIDA, CNOIS y PerúSAT-1 son referencias institucionales, no patrocinio ni aval.

- El backend necesita pruebas reales de RLS, autenticación y reconexión antes de la demo multijugador.

**FRASE DE ALCANCE FINAL**

**PERUSAT CREW: Operación El Niño es un videojuego educativo cooperativo sobre diseño y**

operación de misiones de observación terrestre. Su Misión A enseña a obtener y comunicar evidencia útil sobre lluvias e inundaciones en el Perú; su Misión B sobre incendios está documentada para

**después. No es un servicio real de alerta temprana.**

### Checklist de decisión final para todo el equipo

| Confirmar | Evidencia concreta para la entrega |
| --- | --- |
| Alcance | Solo Misión A implementada; Misión B documentada sin prometer jugabilidad. |
| Demo | Dos jugadores conectados, una solicitud, captura, transmisión y reporte. |
| Ciencia | Una referencia NASA verificable, unidad y fecha; imágenes simuladas identificadas. |
| Seguridad | Permisos Supabase, estados por rol y control de revisiones probados. |
| Aprendizaje | Resultado explica al menos dos compromisos de ingeniería. |
| Entrega | URL pública, repositorio, capturas, pitch, fuentes y video exigido por la sede. |

### Decisiones que no deberían reabrirse durante la construcción

Motor web React + Phaser + TypeScript; Supabase PostgreSQL para estado cooperativo; GitHub como fuente del código; despliegue gratuito; PerúSAT-1 únicamente como referente del sensor óptico; Base CNOIS como consola virtual; NASA IMERG como fuente de contexto para inundaciones. Cualquier ajuste técnico debe mantener el mismo flujo y los contratos compartidos.

---
