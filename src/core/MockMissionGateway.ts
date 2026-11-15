import type { MissionAction, MissionSnapshot } from '../contracts/mission';
import { isMissionAction } from '../contracts/validation';
import {
  type ConfirmedMissionChange, type MissionGateway, type MissionGatewayEvent,
  MissionGatewayError,
} from './MissionGateway';

interface MockRoom {
  snapshot: MissionSnapshot;
  events: Map<string, { action: string; change: ConfirmedMissionChange }>;
  listeners: Set<(event: MissionGatewayEvent) => void>;
}

/** Share a hub between mock clients to simulate one in-memory room in a single JS process. */
export class MockMissionHub {
  readonly rooms = new Map<string, MockRoom>();
}

const defaultHub = new MockMissionHub();
const copy = <T>(value: T): T => structuredClone(value);

function createSnapshot(roomId: string): MissionSnapshot {
  return {
    schemaVersion: 3,
    roomId,
    missionId: 'flood-piura-01',
    phase: 'briefing',
    status: 'ready',
    revision: 0,
    // Zeroes are placeholders only; Role 02 owns mission resource initialization.
    resources: { energyWh: 0, storageMb: 0, contactSeconds: 0, budgetCredits: 0, massKg: 0 },
    observations: [],
  };
}

export class MockMissionGateway implements MissionGateway {
  constructor(private readonly hub: MockMissionHub = defaultHub) {}

  private room(roomId: string): MockRoom {
    if (!roomId.trim()) throw new MissionGatewayError('INVALID_ACTION', 'roomId is required');
    let room = this.hub.rooms.get(roomId);
    if (!room) {
      room = { snapshot: createSnapshot(roomId), events: new Map(), listeners: new Set() };
      this.hub.rooms.set(roomId, room);
    }
    return room;
  }

  async getSnapshot(roomId: string): Promise<MissionSnapshot> {
    return copy(this.room(roomId).snapshot);
  }

  async dispatch(roomId: string, action: MissionAction): Promise<ConfirmedMissionChange> {
    if (!isMissionAction(action)) {
      throw new MissionGatewayError('INVALID_ACTION', 'Action does not match schemaVersion 3');
    }
    const room = this.room(roomId);
    const serialized = JSON.stringify(action);
    const prior = room.events.get(action.actionId);
    if (prior) {
      if (prior.action !== serialized) {
        throw new MissionGatewayError('DUPLICATE_ACTION', 'actionId was already used for another action');
      }
      return copy(prior.change);
    }
    if (action.expectedRevision !== room.snapshot.revision) {
      throw new MissionGatewayError('REVISION_CONFLICT', 'Snapshot revision has changed');
    }
    // This mock intentionally implements one communication transition, not mission rules.
    if (action.type !== 'REQUEST_OBSERVATION') {
      throw new MissionGatewayError('NOT_IMPLEMENTED', `${action.type} belongs to the Role 02 gateway`);
    }
    if (action.actorRole !== 'ground' || room.snapshot.phase !== 'briefing') {
      throw new MissionGatewayError('INVALID_ACTION', 'Only ground can request an observation in briefing');
    }
    const snapshot: MissionSnapshot = {
      ...room.snapshot,
      phase: 'planning',
      status: 'running',
      selectedTargetId: action.payload.targetId,
      revision: room.snapshot.revision + 1,
    };
    const change = { eventId: `${roomId}:${snapshot.revision}`, actionId: action.actionId, snapshot };
    room.snapshot = snapshot;
    room.events.set(action.actionId, { action: serialized, change });
    for (const listener of room.listeners) listener({ kind: 'confirmed', change: copy(change) });
    return copy(change);
  }

  subscribe(roomId: string, listener: (event: MissionGatewayEvent) => void): () => void {
    const room = this.room(roomId);
    room.listeners.add(listener);
    listener({ kind: 'connection', state: 'connected' });
    return () => {
      room.listeners.delete(listener);
      listener({ kind: 'connection', state: 'disconnected' });
    };
  }
}
