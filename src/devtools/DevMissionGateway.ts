import type {
  MissionAction,
  MissionResources,
  MissionSnapshot,
  Quality,
} from '../contracts/mission';
import { isMissionAction } from '../contracts/validation';
import {
  type ConfirmedMissionChange,
  type ConnectionState,
  type MissionGateway,
  type MissionGatewayEvent,
  MissionGatewayError,
} from '../core/MissionGateway';
import {
  applyAction,
  computeScore,
  createInitialSnapshot as createFloodSnapshot,
} from '../missions/flood/rules';
import type {
  AppliedEvent,
  FloodSnapshot,
  ScenarioId,
  ScoreResult,
} from '../missions/flood/types';

export interface DevFaultConfig {
  /** If set, next CAPTURE_IMAGE produces this quality. */
  forcedQuality?: Quality;
  /** Force low battery mode (Wh). */
  overrideEnergyWh?: number;
  /** Force low storage mode (MB). */
  overrideStorageMb?: number;
  /** Force low contact seconds. */
  overrideContactSeconds?: number;
  /** Artificial latency in milliseconds before dispatching. */
  simulatedLatencyMs?: number;
  /** Whether TRANSMIT_IMAGE automatically requests if not requested by Ground */
  autoRequestTransmission?: boolean;
}

interface DevRoomState {
  snapshot: FloodSnapshot;
  events: Map<string, { action: string; change: ConfirmedMissionChange }>;
  appliedEvents: AppliedEvent[];
  listeners: Set<(event: MissionGatewayEvent) => void>;
  connectionState: ConnectionState;
}

const copy = <T>(value: T): T => structuredClone(value);

export function createInitialSnapshot(roomId: string, scenarioId: ScenarioId = 'A1'): FloodSnapshot {
  return createFloodSnapshot(roomId, scenarioId);
}

/**
 * DevMissionGateway: Pasarela de desarrollo e integración respaldada por el motor
 * de reglas funcional de la Misión A (Rol 02) bajo schemaVersion 3.
 */
export class DevMissionGateway implements MissionGateway {
  private readonly rooms = new Map<string, DevRoomState>();
  public faultConfig: DevFaultConfig = {};

  private getOrCreateRoom(roomId: string): DevRoomState {
    if (!roomId || !roomId.trim()) {
      throw new MissionGatewayError('INVALID_ACTION', 'roomId es obligatorio');
    }
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        snapshot: createInitialSnapshot(roomId, 'A1'),
        events: new Map(),
        appliedEvents: [],
        listeners: new Set(),
        connectionState: 'connected',
      };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  async getSnapshot(roomId: string): Promise<MissionSnapshot> {
    const room = this.getOrCreateRoom(roomId);
    if (this.faultConfig.simulatedLatencyMs) {
      await new Promise((resolve) => setTimeout(resolve, this.faultConfig.simulatedLatencyMs));
    }
    return copy(room.snapshot);
  }

  async dispatch(roomId: string, action: MissionAction): Promise<ConfirmedMissionChange> {
    if (this.faultConfig.simulatedLatencyMs) {
      await new Promise((resolve) => setTimeout(resolve, this.faultConfig.simulatedLatencyMs));
    }

    if (!isMissionAction(action)) {
      throw new MissionGatewayError(
        'INVALID_ACTION',
        'La acción no cumple la estructura canónica de schemaVersion 3'
      );
    }

    const room = this.getOrCreateRoom(roomId);

    if (room.connectionState === 'disconnected') {
      throw new MissionGatewayError(
        'NOT_CONNECTED',
        'No hay conexión activa con el servicio de misión.'
      );
    }

    // 1. Verificación de Idempotencia por actionId
    const serialized = JSON.stringify(action);
    const prior = room.events.get(action.actionId);
    if (prior) {
      if (prior.action !== serialized) {
        throw new MissionGatewayError(
          'DUPLICATE_ACTION',
          'El actionId ya fue utilizado para una acción diferente.'
        );
      }
      return copy(prior.change);
    }

    // 2. Control de Concurrencia Optimista por expectedRevision
    if (action.expectedRevision !== room.snapshot.revision) {
      throw new MissionGatewayError(
        'REVISION_CONFLICT',
        `Conflicto de revisión: esperado ${action.expectedRevision}, actual ${room.snapshot.revision}. Estado desactualizado.`
      );
    }

    // 3. Aplicación de Reglas de Misión A (Inundaciones en Piura - Rol 02)
    const nextSnapshot = this.applyActionRules(room, action);

    // 4. Confirmación Atómica del Evento
    const change: ConfirmedMissionChange = {
      eventId: `evt-${roomId}-${nextSnapshot.revision}-${Date.now()}`,
      actionId: action.actionId,
      snapshot: nextSnapshot,
    };

    room.snapshot = nextSnapshot;
    room.events.set(action.actionId, { action: serialized, change });

    // 5. Notificar a Suscriptores
    for (const listener of room.listeners) {
      listener({ kind: 'confirmed', change: copy(change) });
    }

    return copy(change);
  }

  subscribe(roomId: string, listener: (event: MissionGatewayEvent) => void): () => void {
    const room = this.getOrCreateRoom(roomId);
    room.listeners.add(listener);
    listener({ kind: 'connection', state: room.connectionState });

    return () => {
      room.listeners.delete(listener);
    };
  }

  /** Permite inyectar cambios de estado de conexión en pruebas */
  setConnectionState(roomId: string, state: ConnectionState): void {
    const room = this.getOrCreateRoom(roomId);
    room.connectionState = state;
    for (const listener of room.listeners) {
      listener({ kind: 'connection', state });
    }
  }

  /** Permite forzar recursos en memoria para pruebas de límites */
  injectResources(roomId: string, partial: Partial<MissionResources>): void {
    const room = this.getOrCreateRoom(roomId);
    room.snapshot = {
      ...room.snapshot,
      resources: { ...room.snapshot.resources, ...partial },
      revision: room.snapshot.revision + 1,
    };
    const change: ConfirmedMissionChange = {
      eventId: `evt-override-${room.snapshot.revision}`,
      actionId: `override-${Date.now()}`,
      snapshot: room.snapshot,
    };
    for (const listener of room.listeners) {
      listener({ kind: 'confirmed', change: copy(change) });
    }
  }

  /** Cambia el escenario activo (A1 / A2) reiniciando el snapshot */
  setScenario(roomId: string, scenarioId: ScenarioId): void {
    const room = this.getOrCreateRoom(roomId);
    room.snapshot = createFloodSnapshot(roomId, scenarioId, room.snapshot.revision + 1);
    const change: ConfirmedMissionChange = {
      eventId: `evt-scenario-${room.snapshot.revision}`,
      actionId: `scenario-${Date.now()}`,
      snapshot: room.snapshot,
    };
    for (const listener of room.listeners) {
      listener({ kind: 'confirmed', change: copy(change) });
    }
  }

  /** Calcula la puntuación didáctica actual basada en la bitácora validada */
  getScore(roomId: string): ScoreResult {
    const room = this.getOrCreateRoom(roomId);
    return computeScore(room.snapshot, room.appliedEvents);
  }

  /** Obtiene la lista completa de eventos aplicados */
  getAppliedEvents(roomId: string): AppliedEvent[] {
    const room = this.getOrCreateRoom(roomId);
    return copy(room.appliedEvents);
  }

  private applyActionRules(room: DevRoomState, action: MissionAction): FloodSnapshot {
    const snap = copy(room.snapshot);

    // Ajuste dev: si el Satélite transmite y la Base aún no lo había marcado, en dev se asiste
    if (action.type === 'TRANSMIT_IMAGE' && this.faultConfig.autoRequestTransmission !== false) {
      const obs = snap.observations.find((o) => o.observationId === action.payload.observationId);
      if (obs && !obs.requested) {
        obs.requested = true;
      }
    }

    const result = applyAction(snap, action);
    room.appliedEvents.push(result.event);

    if (!result.ok) {
      throw new MissionGatewayError(
        result.code === 'STALE_REVISION' ? 'REVISION_CONFLICT' : 'INVALID_ACTION',
        result.message
      );
    }

    let nextSnap = result.snapshot;

    // Falla forzada de calidad en DevTools
    if (this.faultConfig.forcedQuality && action.type === 'CAPTURE_IMAGE') {
      const lastObs = nextSnap.observations[nextSnap.observations.length - 1];
      if (lastObs) {
        lastObs.quality = this.faultConfig.forcedQuality;
      }
    }

    return nextSnap;
  }
}
