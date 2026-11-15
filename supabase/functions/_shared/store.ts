// Acceso a datos que necesitan las Edge Functions, detrás de una interfaz.
//  - Producción: supabaseStore.ts (supabase-js con la clave de servicio, solo en el servidor).
//  - Pruebas: supabase/tests/pgliteStore.ts (las mismas migraciones SQL sobre PostgreSQL real en WASM).
// Así los manejadores se prueban contra el SQL de verdad, no contra un simulacro.

import type { AppliedEvent, FloodSnapshot, MissionAction, PlayerRole, ScenarioId } from './engine.ts';

export interface StoredEvent {
  eventId: string;
  actorId: string;
  action: unknown;
  result: 'accepted' | 'denied';
  reason: string | null;
  revision: number;
}

export interface ReportInput {
  reportId: string;
  finding: string;
  evidence: string[];
  score: unknown;
}

export interface CommitInput {
  roomId: string;
  eventId: string;
  actorId: string;
  actorRole: PlayerRole;
  action: MissionAction;
  expectedRevision: number;
  result: 'accepted' | 'denied';
  reason: string | null;
  newSnapshot: FloodSnapshot | null;
  report: ReportInput | null;
}

export type CommitStatus =
  | 'accepted'
  | 'denied'
  | 'duplicate'
  | 'conflict_payload'
  | 'stale'
  | 'not_member'
  | 'no_room'
  | 'rate_limited';

export interface CommitResult {
  status: CommitStatus;
  revision?: number;
  result?: 'accepted' | 'denied';
  reason?: string | null;
}

export interface CreateRoomInput {
  roomId: string;
  ownerId: string;
  role: PlayerRole;
  scenarioId: ScenarioId;
  snapshot: FloodSnapshot;
}

export interface CreateRoomResult {
  roomId: string;
  joinCode: string;
  role: PlayerRole;
}

/** Error de infraestructura. `kind` decide el código HTTP; el mensaje interno nunca llega al cliente. */
export class StoreError extends Error {
  readonly kind: 'rate_limited' | 'internal';
  constructor(kind: 'rate_limited' | 'internal', message: string) {
    super(message);
    this.name = 'StoreError';
    this.kind = kind;
  }
}

export interface Store {
  /** Valida el JWT de usuario con el servicio Auth. null si no es un usuario válido. */
  getUserFromToken(token: string): Promise<{ id: string } | null>;
  getMembership(roomId: string, userId: string): Promise<PlayerRole | null>;
  getState(roomId: string): Promise<{ snapshot: FloodSnapshot; revision: number } | null>;
  findEvent(roomId: string, eventId: string): Promise<StoredEvent | null>;
  /** Historial de la sala en orden de confirmación (más antiguo primero). */
  listEvents(roomId: string): Promise<AppliedEvent[]>;
  commit(input: CommitInput): Promise<CommitResult>;
  createRoom(input: CreateRoomInput): Promise<CreateRoomResult>;
}
