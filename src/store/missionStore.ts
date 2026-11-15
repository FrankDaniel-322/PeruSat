import { createStore } from 'zustand/vanilla';
import type { MissionAction, MissionSnapshot } from '../contracts/mission';
import { isMissionSnapshot } from '../contracts/validation';
import {
  type ConfirmedMissionChange, type ConnectionState, type MissionGateway,
  MissionGatewayError,
} from '../core/MissionGateway';

export interface MissionStoreState {
  roomId: string | null;
  snapshot: MissionSnapshot | null;
  connection: ConnectionState;
  pending: boolean;
  error: MissionGatewayError | null;
  connect: (roomId: string) => Promise<void>;
  reconnect: () => Promise<void>;
  sendAction: (action: MissionAction) => Promise<void>;
  resetUi: () => void;
}

function asGatewayError(error: unknown): MissionGatewayError {
  return error instanceof MissionGatewayError
    ? error
    : new MissionGatewayError('TRANSPORT_ERROR', error instanceof Error ? error.message : String(error));
}

function immutableSnapshot(snapshot: MissionSnapshot): MissionSnapshot {
  const copy = structuredClone(snapshot);
  Object.freeze(copy.resources);
  for (const observation of copy.observations) Object.freeze(observation);
  Object.freeze(copy.observations);
  return Object.freeze(copy);
}

export function createMissionStore(gateway: MissionGateway) {
  let unsubscribe: (() => void) | null = null;
  let connectionToken = 0;
  const seenEvents = new Set<string>();

  const store = createStore<MissionStoreState>((set, get) => {
    const acceptSnapshot = (snapshot: MissionSnapshot) => {
      if (!isMissionSnapshot(snapshot)) throw new MissionGatewayError('INVALID_SNAPSHOT', 'Invalid mission snapshot');
      if (snapshot.roomId !== get().roomId) return;
      if (!get().snapshot || snapshot.revision >= get().snapshot!.revision) {
        set({ snapshot: immutableSnapshot(snapshot), error: null });
      }
    };

    const refresh = async (roomId: string, token: number) => {
      try {
        const snapshot = await gateway.getSnapshot(roomId);
        if (token === connectionToken) acceptSnapshot(snapshot);
      } catch (error) {
        if (token === connectionToken) set({ error: asGatewayError(error), connection: 'reconnecting' });
      }
    };

    const acceptChange = (change: ConfirmedMissionChange, roomId: string, token: number) => {
      if (token !== connectionToken || seenEvents.has(change.eventId)) return;
      try {
        if (!isMissionSnapshot(change.snapshot)) {
          throw new MissionGatewayError('INVALID_SNAPSHOT', 'Invalid confirmed snapshot');
        }
        if (change.snapshot.roomId !== roomId) return;
        seenEvents.add(change.eventId);
        const current = get().snapshot;
        if (current && change.snapshot.revision > current.revision + 1) {
          void refresh(roomId, token);
          return;
        }
        acceptSnapshot(change.snapshot);
      } catch (error) {
        set({ error: asGatewayError(error) });
      }
    };

    return {
      roomId: null,
      snapshot: null,
      connection: 'disconnected',
      pending: false,
      error: null,
      connect: async (roomId) => {
        unsubscribe?.();
        unsubscribe = null;
        const token = ++connectionToken;
        seenEvents.clear();
        set({ roomId, snapshot: null, connection: 'connecting', pending: false, error: null });
        try {
          unsubscribe = gateway.subscribe(roomId, (event) => {
            if (token !== connectionToken) return;
            if (event.kind === 'connection') set({ connection: event.state });
            else acceptChange(event.change, roomId, token);
          });
          await refresh(roomId, token);
        } catch (error) {
          if (token === connectionToken) set({ error: asGatewayError(error), connection: 'reconnecting' });
        }
      },
      reconnect: async () => {
        const roomId = get().roomId;
        if (roomId) await get().connect(roomId);
      },
      sendAction: async (action) => {
        const roomId = get().roomId;
        if (!roomId || !get().snapshot || get().connection !== 'connected') {
          set({ error: new MissionGatewayError('NOT_CONNECTED', 'Connect to a room before sending actions') });
          return;
        }
        const token = connectionToken;
        set({ pending: true, error: null });
        try {
          const change = await gateway.dispatch(roomId, action);
          acceptChange(change, roomId, token);
        } catch (error) {
          if (token === connectionToken) {
            const gatewayError = asGatewayError(error);
            set({ error: gatewayError });
            if (gatewayError.code === 'REVISION_CONFLICT') await refresh(roomId, token);
          }
        } finally {
          if (token === connectionToken) set({ pending: false });
        }
      },
      resetUi: () => {
        ++connectionToken;
        unsubscribe?.();
        unsubscribe = null;
        seenEvents.clear();
        set({ roomId: null, snapshot: null, connection: 'disconnected', pending: false, error: null });
      },
    };
  });
  return store;
}

export type MissionStore = ReturnType<typeof createMissionStore>;
export const selectResources = (state: MissionStoreState) => state.snapshot?.resources ?? null;
export const selectPhase = (state: MissionStoreState) => state.snapshot?.phase ?? null;
export const selectObservations = (state: MissionStoreState) => state.snapshot?.observations ?? [];
