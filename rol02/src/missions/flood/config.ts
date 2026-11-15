// Parámetros de la Misión A. TODOS son valores didácticos del juego, no del satélite real.
// Origen de los números: documento maestro, sección 10 (energía, memoria, contacto, presupuesto).
// Los que NO salen del documento están marcados con "DECISIÓN 02".

import type { Finding, MissionResources, Quality } from '../../contracts/index.ts';
import type { DenialCode, ProfileId, ScenarioId, TargetId } from './types.ts';

export const RULES_VERSION = 'flood-rules-1';

export const CAPTURE_ENERGY_WH = 12; // doc: la captura consume 12 Wh
export const TRANSMIT_ENERGY_WH = 4; // doc: la transmisión consume 4 Wh por archivo
export const LINK_MBPS = 4; // doc: 4 Mb/s simulados

export interface CaptureProfile {
  profileId: ProfileId;
  label: string;
  sizeMb: number;
  costCredits: number;
}

// doc: imagen 14 MB, detallada 28 MB, comprimida 9 MB; coste simulado 10 o 20.
// DECISIÓN 02: estándar y comprimida cuestan 10; detallada cuesta 20.
export const PROFILES: Record<ProfileId, CaptureProfile> = {
  standard: { profileId: 'standard', label: 'Estándar', sizeMb: 14, costCredits: 10 },
  detailed: { profileId: 'detailed', label: 'Detallada', sizeMb: 28, costCredits: 20 },
  compressed: { profileId: 'compressed', label: 'Comprimida', sizeMb: 9, costCredits: 10 },
};

export interface TargetDef {
  targetId: TargetId;
  label: string;
  /**
   * Lo que muestra la imagen DEMOSTRATIVA de esta zona cuando la captura es válida.
   * Es un guion de la demo, no un dato real ni una alerta (ver "Cadena de evidencia
   * admisible" del documento). Rol 03/06 deben validar la narrativa.
   */
  truth: Exclude<Finding, 'insufficient'>;
}

export const TARGETS: Record<TargetId, TargetDef> = {
  'piura-rio': { targetId: 'piura-rio', label: 'Cauce del río (zona de desborde)', truth: 'possible_flood' },
  'piura-urbano': { targetId: 'piura-urbano', label: 'Zona urbana de baja altura', truth: 'possible_flood' },
  'piura-agricola': { targetId: 'piura-agricola', label: 'Campos de cultivo en terraza alta', truth: 'normal' },
};

// doc: masa fija informativa. Sin valor verificado todavía → 0 = "sin dato" (la UI debe ocultarla).
// PENDIENTE rol 06: fuente verificable de la masa de PerúSAT-1.
export const INFORMATIVE_MASS_KG = 0;

// doc, sección 10: 100 Wh, 70 MB, 80 s, 100 créditos.
const DEMO_RESOURCES: MissionResources = {
  energyWh: 100,
  storageMb: 70,
  contactSeconds: 80,
  budgetCredits: 100,
  massKg: INFORMATIVE_MASS_KG,
};

export interface ScenarioDef {
  scenarioId: ScenarioId;
  title: string;
  initialResources: MissionResources;
  /** Calidad de la captura según el nº de intento en esa zona; el último valor se repite. */
  captureOutcomes: Record<TargetId, Quality[]>;
  /** Observaciones útiles necesarias para ganar. */
  requiredValidEvidence: number;
  /** Observaciones útiles para el puntaje completo de rigor. */
  fullEvidence: number;
}

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  // A1 · Práctica rutinaria: sin fallas; dos observaciones válidas.
  A1: {
    scenarioId: 'A1',
    title: 'Práctica rutinaria',
    initialResources: DEMO_RESOURCES,
    captureOutcomes: {
      'piura-rio': ['valid'],
      'piura-urbano': ['valid'],
      'piura-agricola': ['valid'],
    },
    requiredValidEvidence: 2,
    fullEvidence: 2,
  },
  // A2 · Alerta por lluvias: el 1.er intento sobre el río sale nublado; el 2.º, despejado.
  // DECISIÓN 02: mismos recursos que A1; la presión viene de la nube + la ventana de contacto.
  A2: {
    scenarioId: 'A2',
    title: 'Alerta por lluvias',
    initialResources: DEMO_RESOURCES,
    captureOutcomes: {
      'piura-rio': ['cloudy', 'valid'],
      'piura-urbano': ['valid'],
      'piura-agricola': ['valid'],
    },
    requiredValidEvidence: 1,
    fullEvidence: 2,
  },
};

// Textos listos para que 03/04 los usen como microcopy de errores.
export const DENIAL_MESSAGES: Record<DenialCode, string> = {
  STALE_REVISION: 'El estado cambió mientras actuabas. Revisa la pantalla e inténtalo de nuevo.',
  UNKNOWN_ACTION: 'Acción no reconocida.',
  WRONG_ROLE: 'Esa acción le corresponde al otro rol.',
  MISSION_FINISHED: 'La misión ya terminó. Reinicia para volver a intentarlo.',
  WRONG_PHASE: 'Esa acción no está disponible en esta fase de la misión.',
  UNKNOWN_TARGET: 'La zona solicitada no existe en esta misión.',
  UNKNOWN_PROFILE: 'El perfil de captura no existe.',
  PLAN_NOT_APPROVED: 'Primero el Satélite debe aprobar un plan de captura.',
  TARGET_MISMATCH: 'La zona a capturar no coincide con la solicitud de la Base.',
  INSUFFICIENT_ENERGY: 'No hay energía suficiente para esta operación.',
  INSUFFICIENT_STORAGE: 'No hay memoria libre suficiente para este archivo.',
  INSUFFICIENT_BUDGET: 'No alcanza el presupuesto para este perfil.',
  EXCEEDS_CONTACT_WINDOW: 'El archivo no cabe en el tiempo de contacto que queda.',
  UNKNOWN_OBSERVATION: 'Esa observación no existe.',
  ALREADY_REQUESTED: 'Ya pediste transmitir esa observación.',
  NOT_REQUESTED: 'La Base todavía no pidió transmitir esa observación.',
  ALREADY_TRANSMITTED: 'Esa observación ya fue transmitida.',
  NOT_TRANSMITTED: 'La observación aún no llegó a la Base.',
  ALREADY_CLASSIFIED: 'Esa observación ya fue clasificada.',
  UNKNOWN_FINDING: 'Clasificación no válida.',
  INVALID_EVIDENCE:
    'Una imagen con nubes, corrupta o incompleta no permite concluir: solo puede clasificarse como evidencia insuficiente.',
  INVALID_REPORT_ID: 'El informe necesita un identificador.',
};
