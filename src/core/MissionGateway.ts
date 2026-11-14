import type { MissionAction, MissionSnapshot } from '../contracts/mission';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type MissionErrorCode =
  | 'INVALID_ACTION' | 'INVALID_SNAPSHOT' | 'REVISION_CONFLICT'
  | 'DUPLICATE_ACTION' | 'NOT_IMPLEMENTED' | 'NOT_CONNECTED' | 'TRANSPORT_ERROR';

export class MissionGatewayError extends Error {
  constructor(public readonly code: MissionErrorCode, message: string) {
    super(message);
    this.name = 'MissionGatewayError';
  }
}

export interface ConfirmedMissionChange {
  /** Globally unique within a room. */
  eventId: string;
  actionId: string;
  snapshot: MissionSnapshot;
}

export type MissionGatewayEvent =
  | { kind: 'confirmed'; change: ConfirmedMissionChange }
  | { kind: 'connection'; state: ConnectionState };

/** Backend implementations must authorize actions, commit revisions, then publish confirmed events. */
export interface MissionGateway {
  getSnapshot(roomId: string): Promise<MissionSnapshot>;
  dispatch(roomId: string, action: MissionAction): Promise<ConfirmedMissionChange>;
  subscribe(roomId: string, listener: (event: MissionGatewayEvent) => void): () => void;
}
