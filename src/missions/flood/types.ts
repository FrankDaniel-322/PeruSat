// Tipos específicos para la Misión A (flood-piura-01).
// Extienden los contratos canónicos de contracts/mission.ts sin modificarlos.

import type {
  Finding,
  MissionAction,
  MissionSnapshot,
  Observation,
  PlayerRole,
} from '../../contracts/mission';

export type ScenarioId = 'A1' | 'A2';
export type ProfileId = 'standard' | 'detailed' | 'compressed';
export type TargetId = 'piura-rio' | 'piura-urbano' | 'piura-agricola';

/** Extensión de Observation para Misión A (solicitud de enlace y clasificación). */
export interface FloodObservation extends Observation {
  /** La Base CNOIS solicitó transmitir esta observación por antena. */
  requested?: boolean;
  /** Clasificación asignada por la Base tras recibir la telemetría. */
  finding?: Finding;
}

/** Extensión de MissionSnapshot con estado de simulación de Misión A. */
export interface FloodSnapshot extends MissionSnapshot {
  observations: FloodObservation[];
  /** Escenario de simulación activo (A1: Práctica rutinaria / A2: Alerta por lluvias). */
  scenarioId: ScenarioId;
  /** Contador determinista de capturas por zona para reproducir nubosidad en A2. */
  captureAttempts: Partial<Record<string, number>>;
  /** Identificador del informe simulado emitido. */
  reportId?: string;
  /** Conclusión científica final derivada de la evidencia válida. */
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

/** Contexto de ejecución para validar y aplicar una acción en el servidor/gateway. */
export interface ActionEnvelope {
  eventId: string;
  expectedRevision: number;
  actorRole: PlayerRole;
  action: MissionAction;
  nowUtc: string; // ISO 8601 UTC
}

/** Evento registrado en la bitácora de misión (aceptado o denegado). */
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
  total: number; // 0..100, puntaje didáctico de la simulación
  breakdown: ScoreBreakdown;
  notes: string[];
}
