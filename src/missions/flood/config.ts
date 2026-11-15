// Parámetros didácticos de la Misión A (flood-piura-01).
// Fuentes: Documento Maestro (sección 10: energía, memoria, contacto, presupuesto).
// Valores didácticos diseñados para modelar compensaciones de ingeniería aeroespacial.

import type { Finding, MissionResources, Quality } from '../../contracts/mission.ts';
import type { DenialCode, ProfileId, ScenarioId, TargetId } from './types.ts';

export const RULES_VERSION = 'flood-rules-1';

export const CAPTURE_ENERGY_WH = 12; // Consumo por captura óptica: 12 Wh
export const TRANSMIT_ENERGY_WH = 4; // Consumo por transmisión banda X: 4 Wh por archivo
export const LINK_MBPS = 4; // Tasa simulada de enlace de bajada: 4 Mb/s

export interface CaptureProfile {
  profileId: ProfileId;
  label: string;
  sizeMb: number;
  costCredits: number;
}

// 14 MB (estándar), 28 MB (detallada), 9 MB (comprimida)
export const PROFILES: Record<ProfileId, CaptureProfile> = {
  standard: { profileId: 'standard', label: 'Estándar', sizeMb: 14, costCredits: 10 },
  detailed: { profileId: 'detailed', label: 'Detallada', sizeMb: 28, costCredits: 20 },
  compressed: { profileId: 'compressed', label: 'Comprimida', sizeMb: 9, costCredits: 10 },
};

export interface TargetDef {
  targetId: TargetId;
  label: string;
  /** Verdad terrena simulada en el guion de la misión cuando la captura no tiene nubes. */
  truth: Exclude<Finding, 'insufficient'>;
}

export const TARGETS: Record<TargetId, TargetDef> = {
  'piura-rio': { targetId: 'piura-rio', label: 'Cauce del río (zona de desborde)', truth: 'possible_flood' },
  'piura-urbano': { targetId: 'piura-urbano', label: 'Zona urbana de baja altura', truth: 'possible_flood' },
  'piura-agricola': { targetId: 'piura-agricola', label: 'Campos de cultivo en terraza alta', truth: 'normal' },
};

/** Normalización de perfiles para compatibilidad */
export function normalizeProfileId(id: string): ProfileId | string {
  if (id === 'optico-submetrico' || id === 'optico') return 'standard';
  return id;
}

/** Normalización de identificadores de zona para compatibilidad con la UI */
export function normalizeTargetId(id: string): TargetId | string {
  if (id === 'rio-piura') return 'piura-rio';
  if (id === 'rio-chira') return 'piura-agricola';
  return id;
}

// Masa informativa PerúSAT-1 (pendiente confirmación técnica, 0 = oculto en UI)
export const INFORMATIVE_MASS_KG = 0;

// Recursos iniciales de referencia (100 Wh, 70 MB, 80 s, 100 créditos)
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
  /** Calidad de captura según el intento por zona; el último valor se mantiene */
  captureOutcomes: Record<TargetId, Quality[]>;
  /** Observaciones útiles mínimas para ganar */
  requiredValidEvidence: number;
  /** Observaciones útiles requeridas para el puntaje completo de rigor */
  fullEvidence: number;
}

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  // A1 · Práctica rutinaria: condiciones ópticas despejadas; requiere 2 observaciones válidas.
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
  // A2 · Alerta por lluvias: 1.er intento sobre el río sale nublado; 2.º intento despejado.
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

// Textos de denegación pedagógicos y contextuales en español
export const DENIAL_MESSAGES: Record<DenialCode, string> = {
  STALE_REVISION: 'El estado cambió mientras actuabas. Conflicto de revisión.',
  UNKNOWN_ACTION: 'Acción no reconocida en el protocolo de misión.',
  WRONG_ROLE: 'Esa acción le corresponde al otro rol de la tripulación. Solo la Base CNOIS (ground) o el Satélite (satellite) pueden ejecutar sus respectivas acciones.',
  MISSION_FINISHED: 'La misión ya terminó. Reinicia para volver a intentarlo.',
  WRONG_PHASE: 'Esa acción no está disponible en esta fase operativa.',
  UNKNOWN_TARGET: 'La zona solicitada no existe en la cartografía de la misión.',
  UNKNOWN_PROFILE: 'El perfil de captura no existe en el catálogo del sensor.',
  PLAN_NOT_APPROVED: 'Primero el Satélite debe aprobar un plan de captura válido.',
  TARGET_MISMATCH: 'La zona a capturar no coincide con la solicitud activa de la Base.',
  INSUFFICIENT_ENERGY: 'Energía insuficiente en baterías EPS para realizar la captura o comprometer el plan de observación. Se requiere recarga solar.',
  INSUFFICIENT_STORAGE: 'Memoria interna insuficiente en la grabadora de a bordo para almacenar la nueva captura.',
  INSUFFICIENT_BUDGET: 'No alcanza el presupuesto de créditos para este perfil.',
  EXCEEDS_CONTACT_WINDOW: 'La ventana de comunicación física ha terminado antes de completar la descarga. El archivo excede el tiempo restante.',
  UNKNOWN_OBSERVATION: 'Esa observación no existe en el registro del satélite.',
  ALREADY_REQUESTED: 'Ya pediste transmitir esa observación.',
  NOT_REQUESTED: 'La Base CNOIS todavía no solicitó la bajada de esa observación.',
  ALREADY_TRANSMITTED: 'Esta observación ya ha sido transmitida a Tierra.',
  NOT_TRANSMITTED: 'No se puede clasificar una imagen que no ha sido transmitida a Tierra.',
  ALREADY_CLASSIFIED: 'Esa observación ya fue clasificada.',
  UNKNOWN_FINDING: 'Clasificación científica no válida.',
  INVALID_EVIDENCE:
    'Una imagen con nubes o incompleta no permite confirmar anegamiento: solo puede clasificarse como evidencia insuficiente.',
  INVALID_REPORT_ID: 'El informe necesita un identificador.',
};
