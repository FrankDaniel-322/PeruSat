// Implementación de Store con supabase-js y la clave de servicio.
// SOLO se importa desde las Edge Functions (create_room/index.ts y dispatch_action/index.ts).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase en el entorno de la función:
// no se guardan en el repositorio ni se envían al navegador.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import type { AppliedEvent, FloodSnapshot, PlayerRole } from './engine.ts';
import {
  type CommitInput,
  type CommitResult,
  type CreateRoomInput,
  type CreateRoomResult,
  type Store,
  StoreError,
  type StoredEvent,
} from './store.ts';

export function createSupabaseStore(url: string, serviceRoleKey: string): Store {
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fail = (what: string, message: string): never => {
    throw new StoreError(message.includes('rate_limited') ? 'rate_limited' : 'internal', `${what}: ${message}`);
  };

  return {
    async getUserFromToken(token: string) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },

    async getMembership(roomId: string, userId: string): Promise<PlayerRole | null> {
      const { data, error } = await admin
        .from('room_members')
        .select('role')
        .eq('room_id', roomId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) fail('getMembership', error.message);
      return (data?.role as PlayerRole | undefined) ?? null;
    },

    async getState(roomId: string) {
      const { data, error } = await admin
        .from('mission_state')
        .select('snapshot, revision')
        .eq('room_id', roomId)
        .maybeSingle();
      if (error) fail('getState', error.message);
      if (!data) return null;
      return { snapshot: data.snapshot as FloodSnapshot, revision: data.revision as number };
    },

    async findEvent(roomId: string, eventId: string): Promise<StoredEvent | null> {
      const { data, error } = await admin
        .from('mission_events')
        .select('event_id, actor_id, action, result, reason, revision')
        .eq('room_id', roomId)
        .eq('event_id', eventId)
        .maybeSingle();
      if (error) fail('findEvent', error.message);
      if (!data) return null;
      return {
        eventId: data.event_id,
        actorId: data.actor_id,
        action: data.action,
        result: data.result,
        reason: data.reason,
        revision: data.revision,
      };
    },

    async listEvents(roomId: string): Promise<AppliedEvent[]> {
      // Los últimos 1000 por orden de confirmación (seq); el puntaje solo mira desde el último reinicio.
      const { data, error } = await admin
        .from('mission_events')
        .select('event_id, actor_role, action, result, reason, revision, created_at, seq')
        .eq('room_id', roomId)
        .order('seq', { ascending: false })
        .limit(1000);
      if (error) fail('listEvents', error.message);
      return (data ?? []).reverse().map((row) => {
        const ev: AppliedEvent = {
          eventId: row.event_id,
          revision: row.revision,
          actorRole: row.actor_role,
          action: row.action,
          result: row.result,
          nowUtc: row.created_at,
        };
        if (row.reason) ev.code = row.reason;
        return ev;
      });
    },

    async commit(input: CommitInput): Promise<CommitResult> {
      const { data, error } = await admin.rpc('commit_mission_event', {
        p_room_id: input.roomId,
        p_event_id: input.eventId,
        p_actor_id: input.actorId,
        p_actor_role: input.actorRole,
        p_action: input.action,
        p_expected_revision: input.expectedRevision,
        p_result: input.result,
        p_reason: input.reason,
        p_new_snapshot: input.newSnapshot,
        p_report: input.report,
      });
      if (error) fail('commit', error.message);
      return data as CommitResult;
    },

    async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
      const { data, error } = await admin.rpc('create_room_with_state', {
        p_room_id: input.roomId,
        p_owner: input.ownerId,
        p_owner_role: input.role,
        p_scenario: input.scenarioId,
        p_snapshot: input.snapshot,
      });
      if (error) fail('createRoom', error.message);
      return data as CreateRoomResult;
    },
  };
}
