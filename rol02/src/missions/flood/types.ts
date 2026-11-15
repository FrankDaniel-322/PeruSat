// Tipos propios de la Misión A (rol 02). Extienden contracts v3 SIN modificarlo.
// Los campos marcados "PROPUESTA 02→01" necesitan aprobación del rol 01 antes de
// pasar a src/contracts/ (regla del documento: no cambiar contratos por cuenta propia).

import type {
  Finding,
  MissionAction,
  MissionSnapshot,
  Observation,
  PlayerRole,
} from '../../contracts/index.ts';

export type ScenarioId = 'A1' | 'A2';
export type ProfileId = 'standard' | 'detailed' | 'compressed';
export type TargetId = 'piura-rio' | 'piura-urbano' | 'piura-agricola';

/** PROPUESTA 02→01: dos campos opcionales sobre Observation. */
export interface FloodObservation extends Observation {
  /** La Base pidió transmitir esta observación (TRANSMIT_IMAGE lo exige). */
  requested?: boolean;
  /** Clasificación que hizo la Base una vez recibida. */
  finding?: Finding;
}

/** PROPUESTA 02→01: campos extra sobre MissionSnapshot. */
export interface FloodSnapshot extends MissionSnapshot {
  observations: FloodObservation[];
  /** Qué guion aplica (A1 práctica / A2 alerta por lluvias). */
  scenarioId: ScenarioId;
  /** Intentos de captura por zona; hace reproducible la nubosidad de A2. */
  captureAttempts: Partial<Record<string, number>>;
  reportId?: string;
  reportFinding?: Finding;
}

export type DenialCode =
  | 'STALE_REVISION'
  | 'UNKNOWN_ACTION'
  | 'WRONG_ROLE'
  | 'MISSION_FINISHED'
  | 'WRONG_PHASE'
  | 'UNKNOWN_TARGET'
  | 'UNKNOWN_PROFILE'
  | 'PLAN_NOT_APPROVED'
  | 'TARGET_MISMATCH'
  | 'INSUFFICIENT_ENERGY'
  | 'INSUFFICIENT_STORAGE'
  | 'INSUFFICIENT_BUDGET'
  | 'EXCEEDS_CONTACT_WINDOW'
  | 'UNKNOWN_OBSERVATION'
  | 'ALREADY_REQUESTED'
  | 'NOT_REQUESTED'
  | 'ALREADY_TRANSMITTED'
  | 'NOT_TRANSMITTED'
  | 'ALREADY_CLASSIFIED'
  | 'UNKNOWN_FINDING'
  | 'INVALID_EVIDENCE'
  | 'INVALID_REPORT_ID';

/** Lo que llega al servidor: una intención + el contexto para validarla. */
export interface ActionEnvelope {
  eventId: string;
  expectedRevision: number;
  actorRole: PlayerRole;
  action: MissionAction;
  nowUtc: string; // ISO 8601 UTC, lo pone el servidor
}

/** Lo que se guarda en mission_events (aceptado o denegado). */
export interface AppliedEvent {
  eventId: string;
  revision: number;
  actorRole: PlayerRole;
  action: MissionAction;
  result: 'accepted' | 'denied';
  code?: DenialCode;
  nowUtc: string;
}

export type ApplyResult =
  | { ok: true; snapshot: FloodSnapshot; event: AppliedEvent }
  | { ok: false; code: DenialCode; message: string; event: AppliedEvent };

export interface ScoreBreakdown {
  rigor: number; // máx 30
  engineering: number; // máx 25
  collaboration: number; // máx 20
  communication: number; // máx 15
  efficiency: number; // máx 10
}

export interface ScoreResult {
  total: number; // 0..100, puntaje DIDÁCTICO (no es la calificación del jurado)
  breakdown: ScoreBreakdown;
  notes: string[];
}
