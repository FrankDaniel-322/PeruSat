import type {
  MissionAction,
  MissionResources,
  MissionSnapshot,
  Observation,
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
}

interface DevRoomState {
  snapshot: MissionSnapshot;
  events: Map<string, { action: string; change: ConfirmedMissionChange }>;
  listeners: Set<(event: MissionGatewayEvent) => void>;
  connectionState: ConnectionState;
}

const copy = <T>(value: T): T => structuredClone(value);

export function createInitialSnapshot(roomId: string): MissionSnapshot {
  const initialResources: MissionResources = {
    energyWh: 100,
    storageMb: 70,
    contactSeconds: 80,
    budgetCredits: 100,
    massKg: 450, // Masa fija referencial de PerúSAT-1
  };

  return {
    schemaVersion: 3,
    roomId,
    missionId: 'flood-piura-01',
    phase: 'briefing',
    status: 'active',
    revision: 0,
    resources: initialResources,
    observations: [],
  };
}

/**
 * DevMissionGateway: Simulador de integración autónomo para pruebas de Rol 01.
 * Implementa MissionGateway y ejecuta las transiciones canónicas de Misión A
 * de acuerdo con schemaVersion: 3 del Documento Maestro.
 */
export class DevMissionGateway implements MissionGateway {
  private readonly rooms = new Map<string, DevRoomState>();
  public faultConfig: DevFaultConfig = {};
  private observationCounter = 0;

  private getOrCreateRoom(roomId: string): DevRoomState {
    if (!roomId || !roomId.trim()) {
      throw new MissionGatewayError('INVALID_ACTION', 'roomId es obligatorio');
    }
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        snapshot: createInitialSnapshot(roomId),
        events: new Map(),
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

    // 3. Aplicación de Reglas de Misión A (Inundaciones en Piura)
    const nextSnapshot = this.applyActionRules(room.snapshot, action);

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

  private applyActionRules(current: MissionSnapshot, action: MissionAction): MissionSnapshot {
    const snap = copy(current);

    switch (action.type) {
      case 'REQUEST_OBSERVATION': {
        if (action.actorRole !== 'ground') {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Solo la Base CNOIS (ground) puede solicitar una observación.'
          );
        }
        if (snap.phase !== 'briefing') {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'La solicitud de observación solo puede realizarse en la fase de briefing.'
          );
        }

        snap.phase = 'planning';
        snap.selectedTargetId = action.payload.targetId;
        snap.revision += 1;
        return snap;
      }

      case 'APPROVE_PLAN': {
        if (action.actorRole !== 'satellite') {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Solo el Satélite (satellite) puede aprobar el plan de observación.'
          );
        }
        if (snap.phase !== 'planning') {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'La aprobación del plan solo es válida en la fase de planning.'
          );
        }
        if (snap.resources.energyWh < 12) {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Energía insuficiente para comprometer el plan de observación.'
          );
        }

        snap.phase = 'capture';
        snap.selectedProfileId = action.payload.profileId;
        snap.revision += 1;
        return snap;
      }

      case 'CAPTURE_IMAGE': {
        if (action.actorRole !== 'satellite') {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Solo el Satélite puede ejecutar la captura de imágenes.'
          );
        }
        if (snap.phase !== 'capture') {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'La captura óptica solo es válida en la fase de capture.'
          );
        }

        const energyCost = 12; // Captura consume 12 Wh
        const imageSizeMb = 14; // Tamaño estándar 14 MB (simulado)

        if (snap.resources.energyWh < energyCost) {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Energía insuficiente para realizar la captura. Se requiere recarga solar.'
          );
        }
        if (snap.resources.storageMb < imageSizeMb) {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Memoria interna insuficiente para almacenar la nueva captura.'
          );
        }

        this.observationCounter += 1;
        const quality: Quality = this.faultConfig.forcedQuality || 'valid';

        const newObservation: Observation = {
          observationId: `obs-piura-${this.observationCounter}`,
          targetId: action.payload.targetId || snap.selectedTargetId || 'rio-piura',
          quality,
          sizeMb: imageSizeMb,
          capturedAtUtc: new Date().toISOString(),
          isSimulated: true,
          sourceProvider: 'GAME_SIMULATION',
          transmitted: false,
        };

        snap.resources.energyWh -= energyCost;
        snap.resources.storageMb -= imageSizeMb;
        snap.observations.push(newObservation);
        snap.phase = 'downlink';
        snap.revision += 1;
        return snap;
      }

      case 'REQUEST_TRANSMISSION': {
        if (action.actorRole !== 'ground') {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Solo la Base CNOIS puede solicitar la transmisión de un archivo.'
          );
        }
        const obs = snap.observations.find(
          (o) => o.observationId === action.payload.observationId
        );
        if (!obs) {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'El archivo de observación solicitado no existe en el satélite.'
          );
        }
        if (obs.transmitted) {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'La observación ya fue transmitida a Tierra.'
          );
        }

        snap.revision += 1;
        return snap;
      }

      case 'TRANSMIT_IMAGE': {
        if (action.actorRole !== 'satellite') {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Solo el Satélite puede transmitir imágenes hacia Tierra.'
          );
        }
        if (snap.phase !== 'downlink') {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'La transmisión solo puede ejecutarse en la fase de downlink.'
          );
        }

        const obs = snap.observations.find(
          (o) => o.observationId === action.payload.observationId
        );
        if (!obs) {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Observación no encontrada en el inventario del satélite.'
          );
        }
        if (obs.transmitted) {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Esta observación ya ha sido transmitida.'
          );
        }

        const transmitEnergyCost = 4; // Transmisión consume 4 Wh
        const requiredSeconds = Math.ceil((obs.sizeMb * 8) / 4); // ~28 s para 14 MB a 4 Mb/s

        if (snap.resources.energyWh < transmitEnergyCost) {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Energía insuficiente para alimentar el transmisor de bajada de datos.'
          );
        }
        if (snap.resources.contactSeconds < requiredSeconds) {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'La ventana de comunicación física ha terminado antes de completar la descarga.'
          );
        }

        snap.resources.energyWh -= transmitEnergyCost;
        snap.resources.contactSeconds -= requiredSeconds;
        obs.transmitted = true;

        snap.phase = 'review';
        snap.revision += 1;
        return snap;
      }

      case 'CLASSIFY_IMAGE': {
        if (action.actorRole !== 'ground') {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Solo la Base CNOIS puede clasificar evidencias recibidas.'
          );
        }
        const obs = snap.observations.find(
          (o) => o.observationId === action.payload.observationId
        );
        if (!obs) {
          throw new MissionGatewayError('INVALID_ACTION', 'Observación no encontrada.');
        }
        if (!obs.transmitted) {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'No se puede clasificar una imagen que no ha sido transmitida a Tierra.'
          );
        }

        snap.revision += 1;
        return snap;
      }

      case 'SUBMIT_REPORT': {
        if (action.actorRole !== 'ground') {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'Solo la Base CNOIS puede emitir el informe final de situación.'
          );
        }
        if (snap.phase !== 'review') {
          throw new MissionGatewayError(
            'INVALID_ACTION',
            'El informe de situación solo puede emitirse tras la revisión de evidencias.'
          );
        }

        snap.phase = 'debrief';
        snap.status = 'completed';
        snap.revision += 1;
        return snap;
      }

      case 'RESET_MISSION': {
        const resetSnapshot = createInitialSnapshot(snap.roomId);
        resetSnapshot.revision = snap.revision + 1;
        return resetSnapshot;
      }

      default:
        throw new MissionGatewayError('NOT_IMPLEMENTED', 'Tipo de acción no soportada');
    }
  }
}
