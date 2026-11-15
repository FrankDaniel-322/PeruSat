// COPIA del contrato v3 tal como lo describe el Documento Maestro (sección 14). OJO: difiere del
// contrato real del repo (src/contracts/mission.ts); ver rol02/README.md. Solo existe para que esta carpeta sea autónoma.
// se borra esta copia y se importa desde src/contracts/ del repositorio.

export type PlayerRole = 'ground' | 'satellite';
export type MissionId = 'flood-piura-01';
export type MissionPhase =
  | 'briefing' | 'planning' | 'capture'
  | 'downlink' | 'review' | 'debrief';
export type Quality = 'valid' | 'cloudy' | 'corrupt' | 'incomplete';
export type Finding = 'normal' | 'possible_flood' | 'insufficient';

export interface MissionResources {
  energyWh: number;
  storageMb: number;
  contactSeconds: number;
  budgetCredits: number;
  massKg: number; // informativa para PeruSAT-1 real
}

export interface Observation {
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

export interface MissionSnapshot {
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

export type MissionAction =
  | { type: 'REQUEST_OBSERVATION'; targetId: string }
  | { type: 'APPROVE_PLAN'; profileId: string }
  | { type: 'CAPTURE_IMAGE'; targetId: string }
  | { type: 'REQUEST_TRANSMISSION'; observationId: string }
  | { type: 'TRANSMIT_IMAGE'; observationId: string }
  | { type: 'CLASSIFY_IMAGE'; observationId: string; finding: Finding }
  | { type: 'SUBMIT_REPORT'; reportId: string }
  | { type: 'RESET_MISSION' };
