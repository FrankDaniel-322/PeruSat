import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type {
  MissionAction,
  MissionSnapshot,
  PlayerRole,
} from '../contracts/mission';
import { isMissionAction, isMissionSnapshot } from '../contracts/validation';
import {
  type ConfirmedMissionChange,
  type ConnectionState,
  type MissionGateway,
  type MissionGatewayEvent,
  MissionGatewayError,
} from '../core/MissionGateway';
import { ensureAnonymousUser } from './supabaseClient';
import type { AppliedEvent, ScenarioId } from '../missions/flood/types';

interface RoomSubscription {
  listeners: Set<(event: MissionGatewayEvent) => void>;
  channel: RealtimeChannel | null;
  connectionState: ConnectionState;
  latestSnapshot: MissionSnapshot | null;
  inFlightActions: Map<string, Promise<ConfirmedMissionChange>>;
  confirmedActions: Map<string, ConfirmedMissionChange>;
  appliedEvents: AppliedEvent[];
}

const copy = <T>(value: T): T => structuredClone(value);

/**
 * SupabaseMissionGateway: Adaptador remoto para dos jugadores conectados
 * mediante Supabase (PostgreSQL RLS + Edge Functions + Realtime).
 * Respeta 100% la interfaz canónica MissionGateway.
 */
export class SupabaseMissionGateway implements MissionGateway {
  private readonly client: SupabaseClient;
  private readonly rooms = new Map<string, RoomSubscription>();

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  private getOrCreateRoom(roomId: string): RoomSubscription {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        listeners: new Set(),
        channel: null,
        connectionState: 'disconnected',
        latestSnapshot: null,
        inFlightActions: new Map(),
        confirmedActions: new Map(),
        appliedEvents: [],
      };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  /**
   * Obtiene el estado actual de la sala desde PostgreSQL con RLS.
   */
  async getSnapshot(roomId: string): Promise<MissionSnapshot> {
    const room = this.getOrCreateRoom(roomId);
    try {
      await ensureAnonymousUser(this.client);

      const { data, error } = await this.client
        .from('mission_state')
        .select('snapshot, revision')
        .eq('room_id', roomId)
        .single();

      if (error) {
        throw new MissionGatewayError(
          'TRANSPORT_ERROR',
          `Error al obtener estado de la misión: ${error.message}`
        );
      }

      if (!data || !isMissionSnapshot(data.snapshot)) {
        throw new MissionGatewayError(
          'INVALID_SNAPSHOT',
          'El estado almacenado en el servidor no cumple schemaVersion 3.'
        );
      }

      room.latestSnapshot = copy(data.snapshot);
      return copy(data.snapshot);
    } catch (err: unknown) {
      if (err instanceof MissionGatewayError) throw err;
      const msg = err instanceof Error ? err.message : 'Error desconocido de transporte';
      throw new MissionGatewayError('TRANSPORT_ERROR', msg);
    }
  }

  /**
   * Despacha una acción a la Edge Function de Supabase.
   * La Edge Function valida JWT, verifica pertenencia de rol,
   * ejecuta el motor de reglas puro y llama a commit_mission_event.
   */
  async dispatch(roomId: string, action: MissionAction): Promise<ConfirmedMissionChange> {
    if (!isMissionAction(action)) {
      throw new MissionGatewayError(
        'INVALID_ACTION',
        'La acción no cumple la estructura canónica de schemaVersion 3'
      );
    }

    const room = this.getOrCreateRoom(roomId);

    // 1. Idempotencia local ante reintentos o acciones en vuelo
    const priorConfirmed = room.confirmedActions.get(action.actionId);
    if (priorConfirmed) {
      return copy(priorConfirmed);
    }

    const existingPromise = room.inFlightActions.get(action.actionId);
    if (existingPromise) {
      return existingPromise;
    }

    // 2. Control de Concurrencia Optimista previo al envío
    if (room.latestSnapshot && action.expectedRevision !== room.latestSnapshot.revision) {
      throw new MissionGatewayError(
        'REVISION_CONFLICT',
        `Conflicto de revisión local: esperado ${action.expectedRevision}, actual ${room.latestSnapshot.revision}. Estado desactualizado.`
      );
    }

    const dispatchPromise = (async (): Promise<ConfirmedMissionChange> => {
      try {
        await ensureAnonymousUser(this.client);

        // Invocar Edge Function asignada al Rol 02 ('dispatch_action')
        const { data, error } = await this.client.functions.invoke('dispatch_action', {
          body: {
            roomId,
            action,
            expectedRevision: action.expectedRevision,
          },
        });

        if (error) {
          // Mapeo exhaustivo de errores remotos
          const errMsg = error.message || 'Error en Edge Function';
          if (errMsg.includes('stale') || errMsg.includes('STALE_REVISION')) {
            throw new MissionGatewayError('REVISION_CONFLICT', errMsg);
          }
          if (errMsg.includes('not_member') || errMsg.includes('WRONG_ROLE')) {
            throw new MissionGatewayError('INVALID_ACTION', errMsg);
          }
          if (errMsg.includes('duplicate')) {
            throw new MissionGatewayError('DUPLICATE_ACTION', errMsg);
          }
          throw new MissionGatewayError('TRANSPORT_ERROR', errMsg);
        }

        if (!data || !data.ok) {
          const code = data?.code || data?.status;
          const msg = data?.message || data?.reason || 'Acción denegada por el servidor';

          if (code === 'stale' || code === 'STALE_REVISION') {
            throw new MissionGatewayError('REVISION_CONFLICT', msg);
          }
          if (code === 'duplicate') {
            if (data.change) return data.change as ConfirmedMissionChange;
            throw new MissionGatewayError('DUPLICATE_ACTION', msg);
          }
          throw new MissionGatewayError('INVALID_ACTION', msg);
        }

        const change: ConfirmedMissionChange = data.change;
        if (!change || !isMissionSnapshot(change.snapshot)) {
          throw new MissionGatewayError(
            'INVALID_SNAPSHOT',
            'La respuesta del servidor no contiene un snapshot válido.'
          );
        }

        room.latestSnapshot = copy(change.snapshot);
        room.confirmedActions.set(action.actionId, copy(change));
        room.appliedEvents.push({
          eventId: change.eventId,
          revision: change.snapshot.revision,
          actorRole: action.actorRole,
          action: copy(action),
          result: 'accepted',
          nowUtc: new Date().toISOString(),
        });

        // Notificar suscriptores locales de forma inmediata
        this.emitToRoom(roomId, { kind: 'confirmed', change: copy(change) });

        return copy(change);
      } catch (err: unknown) {
        if (err instanceof MissionGatewayError) throw err;
        const msg = err instanceof Error ? err.message : 'Error en la conexión remota';
        throw new MissionGatewayError('TRANSPORT_ERROR', msg);
      } finally {
        room.inFlightActions.delete(action.actionId);
      }
    })();

    room.inFlightActions.set(action.actionId, dispatchPromise);
    return dispatchPromise;
  }

  /**
   * Suscribe al canal Realtime de Supabase para recibir actualizaciones de estado.
   * Maneja reconexión automática y sincronización de estado.
   */
  subscribe(roomId: string, listener: (event: MissionGatewayEvent) => void): () => void {
    const room = this.getOrCreateRoom(roomId);
    room.listeners.add(listener);

    // Emitir estado de conexión inicial
    listener({ kind: 'connection', state: room.connectionState });

    // Iniciar suscripción Realtime si aún no está activa
    if (!room.channel) {
      this.initRealtimeChannel(roomId);
    }

    return () => {
      room.listeners.delete(listener);
      if (room.listeners.size === 0 && room.channel) {
        void room.channel.unsubscribe();
        room.channel = null;
        room.connectionState = 'disconnected';
      }
    };
  }

  /**
   * Inicializa el canal Realtime con reconexión y sincronización automática.
   */
  private initRealtimeChannel(roomId: string): void {
    const room = this.getOrCreateRoom(roomId);
    this.updateConnectionState(roomId, 'connecting');

    const channel = this.client
      .channel(`mission-room:${roomId}`)
      // Escuchar cambios en mission_state
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mission_state',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newSnapshot = payload.new?.snapshot;
          if (newSnapshot && isMissionSnapshot(newSnapshot)) {
            room.latestSnapshot = copy(newSnapshot);
            const change: ConfirmedMissionChange = {
              eventId: `rt-state-${newSnapshot.revision}-${Date.now()}`,
              actionId: 'realtime-sync',
              snapshot: copy(newSnapshot),
            };
            this.emitToRoom(roomId, { kind: 'confirmed', change });
          }
        }
      )
      // Escuchar inserciones en mission_events
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mission_events',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const eventRecord = payload.new;
          if (eventRecord && eventRecord.result === 'accepted') {
            // Si el snapshot aún no se actualizó, forzar consulta
            void this.syncLatestSnapshot(roomId);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.updateConnectionState(roomId, 'connected');
          // Al reconectar, sincronizar snapshot para evitar saltos de revisión
          void this.syncLatestSnapshot(roomId);
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          this.updateConnectionState(roomId, 'reconnecting');
        } else if (status === 'CLOSED') {
          this.updateConnectionState(roomId, 'disconnected');
        }
      });

    room.channel = channel;
  }

  private async syncLatestSnapshot(roomId: string): Promise<void> {
    try {
      const snap = await this.getSnapshot(roomId);
      const change: ConfirmedMissionChange = {
        eventId: `sync-${snap.revision}`,
        actionId: 'sync-reconnect',
        snapshot: snap,
      };
      this.emitToRoom(roomId, { kind: 'confirmed', change });
    } catch {
      // Ignorar errores transitorios de recuperación en background
    }
  }

  private updateConnectionState(roomId: string, state: ConnectionState): void {
    const room = this.getOrCreateRoom(roomId);
    if (room.connectionState !== state) {
      room.connectionState = state;
      this.emitToRoom(roomId, { kind: 'connection', state });
    }
  }

  private emitToRoom(roomId: string, event: MissionGatewayEvent): void {
    const room = this.rooms.get(roomId);
    if (room) {
      for (const listener of room.listeners) {
        listener(event);
      }
    }
  }

  /**
   * Obtiene la pertenencia autenticada y el rol asignado al jugador en la sala.
   * Evita suplantación de identidad garantizando que el rol provenga de room_members.
   */
  async getRoomMembership(roomId: string): Promise<{ roomId: string; role: PlayerRole; joinCode: string } | null> {
    const user = await ensureAnonymousUser(this.client);

    const { data: member, error: memberError } = await this.client
      .from('room_members')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError || !member) return null;

    const { data: roomData } = await this.client
      .from('mission_rooms')
      .select('join_code')
      .eq('id', roomId)
      .single();

    return {
      roomId,
      role: member.role as PlayerRole,
      joinCode: roomData?.join_code || '',
    };
  }

  /**
   * Se une a una sala mediante el código de 6 caracteres.
   * La función join_room asigna automáticamente el rol disponible (ground o satellite).
   * Incluye reintentos automáticos ante colisiones o bloqueos temporales de concurrencia.
   */
  async joinRoomByCode(
    joinCode: string,
    maxRetries = 2
  ): Promise<{ roomId: string; role: PlayerRole; status: string }> {
    const code = joinCode.trim().toUpperCase();
    let attempt = 0;

    while (attempt <= maxRetries) {
      attempt++;
      try {
        await ensureAnonymousUser(this.client);

        const { data, error } = await this.client.rpc('join_room', {
          p_join_code: code,
        });

        if (error) {
          if (attempt <= maxRetries) {
            // Reintentar en caso de bloqueo transitorio o error de transporte
            await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
            continue;
          }
          throw new MissionGatewayError(
            'TRANSPORT_ERROR',
            `Error al unirse a la sala: ${error.message}`
          );
        }

        if (data.status === 'room_not_found') {
          throw new MissionGatewayError('INVALID_ACTION', 'Código de sala no encontrado.');
        }
        if (data.status === 'room_full') {
          throw new MissionGatewayError('INVALID_ACTION', 'La sala ya cuenta con sus 2 tripulantes.');
        }
        if (data.status !== 'joined' && data.status !== 'already_member') {
          throw new MissionGatewayError('INVALID_ACTION', `No se pudo unir a la sala (${data.status}).`);
        }

        return {
          roomId: data.roomId,
          role: data.role as PlayerRole,
          status: data.status,
        };
      } catch (err: unknown) {
        if (err instanceof MissionGatewayError) throw err;
        if (attempt <= maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
          continue;
        }
        const msg = err instanceof Error ? err.message : 'Error desconocido de transporte';
        throw new MissionGatewayError('TRANSPORT_ERROR', msg);
      }
    }

    throw new MissionGatewayError('TRANSPORT_ERROR', 'No se pudo unir a la sala tras múltiples reintentos.');
  }

  /**
   * Crea una nueva sala invocando la Edge Function correspondiente.
   */
  async createRoom(
    scenarioId: ScenarioId = 'A1',
    ownerRole: PlayerRole = 'ground',
  ): Promise<{ roomId: string; joinCode: string; role: PlayerRole }> {
    await ensureAnonymousUser(this.client);

    const { data, error } = await this.client.functions.invoke('create_room', {
      body: {
        scenarioId,
        ownerRole,
      },
    });

    if (error || !data) {
      throw new MissionGatewayError(
        'TRANSPORT_ERROR',
        `Error al crear sala en el servidor: ${error?.message || 'Sin respuesta'}`
      );
    }

    return {
      roomId: data.roomId,
      joinCode: data.joinCode,
      role: data.role as PlayerRole,
    };
  }

  /**
   * Obtiene el historial de eventos aplicados en la sala para el informe final.
   */
  getAppliedEvents(roomId: string): AppliedEvent[] {
    const room = this.rooms.get(roomId);
    return room?.appliedEvents ? copy(room.appliedEvents) : [];
  }
}
