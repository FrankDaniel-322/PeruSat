/** Canonical client contract for Mission A, schemaVersion 3. */
export type PlayerRole = 'ground' | 'satellite';
export type MissionId = 'flood-piura-01';
export type MissionPhase = 'briefing' | 'planning' | 'capture' | 'downlink' | 'review' | 'debrief';
export type Quality = 'valid' | 'cloudy' | 'corrupt' | 'incomplete';
export type Finding = 'normal' | 'possible_flood' | 'insufficient';
export type SourceProvider = 'NASA' | 'CONIDA' | 'GAME_SIMULATION';

export interface MissionResources {
  energyWh: number;
  storageMb: number;
  contactSeconds: number;
  budgetCredits: number;
  massKg: number;
}

export interface Observation {
  observationId: string;
  targetId: string;
  quality: Quality;
  sizeMb: number;
  capturedAtUtc: string;
  isSimulated: boolean;
  sourceProvider: SourceProvider;
  sourceUrl?: string;
  transmitted: boolean;
}

/** Mission outcome is independent of the current phase (Documento Maestro v3). */
export type MissionStatus = 'ready' | 'running' | 'won' | 'lost';

export interface MissionSnapshot {
  schemaVersion: 3;
  roomId: string;
  missionId: MissionId;
  phase: MissionPhase;
  status: MissionStatus;
  revision: number;
  resources: MissionResources;
  observations: Observation[];
  selectedTargetId?: string;
  selectedProfileId?: string;
}

export type MissionActionType =
  | 'REQUEST_OBSERVATION'
  | 'APPROVE_PLAN'
  | 'CAPTURE_IMAGE'
  | 'REQUEST_TRANSMISSION'
  | 'TRANSMIT_IMAGE'
  | 'CLASSIFY_IMAGE'
  | 'SUBMIT_REPORT'
  | 'RESET_MISSION';

interface ActionBase {
  /** Stable client-generated ID; retries must reuse it. */
  actionId: string;
  actorRole: PlayerRole;
  expectedRevision: number;
}

export type MissionAction = ActionBase & (
  | { type: 'REQUEST_OBSERVATION'; payload: { targetId: string } }
  | { type: 'APPROVE_PLAN'; payload: { profileId: string } }
  | { type: 'CAPTURE_IMAGE'; payload: { targetId: string } }
  | { type: 'REQUEST_TRANSMISSION'; payload: { observationId: string } }
  | { type: 'TRANSMIT_IMAGE'; payload: { observationId: string } }
  | { type: 'CLASSIFY_IMAGE'; payload: { observationId: string; finding: Finding } }
  | { type: 'SUBMIT_REPORT'; payload: { finding: Finding } }
  | { type: 'RESET_MISSION'; payload: Record<string, never> }
);
