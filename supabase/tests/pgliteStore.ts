// Store de pruebas: las migraciones SQL reales sobre PostgreSQL (PGlite, WASM), sin red ni Docker.
// Es el mismo contrato que supabaseStore.ts, así los manejadores se prueban contra el SQL de verdad.

import { PGlite } from 'npm:@electric-sql/pglite@0.2.17';
import type { AppliedEvent, FloodSnapshot, PlayerRole } from '../functions/_shared/engine.ts';
import {
  type CommitInput,
  type CommitResult,
  type CreateRoomInput,
  type CreateRoomResult,
  type Store,
  StoreError,
  type StoredEvent,
} from '../functions/_shared/store.ts';

const read = (rel: string): Promise<string> => Deno.readTextFile(new URL(rel, import.meta.url));

/** Base nueva con el entorno de Supabase simulado y las migraciones 0001 y 0002 aplicadas. */
export async function setupDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(await read('./stubs.sql'));
  await db.exec(await read('../migrations/0001_perusat_core.sql'));
  await db.exec(await read('../migrations/0002_security_hardening.sql'));
  return db;
}

/** Ejecuta `fn` con el rol y el usuario de una petición (como haría PostgREST) y restaura el rol. */
export async function asRole<T>(
  db: PGlite,
  role: 'anon' | 'authenticated' | 'service_role',
  userId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${userId ?? ''}', false); set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role;');
  }
}

export class PgliteStore implements Store {
  /** token de prueba -> id de usuario (sustituye al servicio Auth). */
  readonly tokens = new Map<string, string>();
  constructor(readonly db: PGlite) {}

  getUserFromToken(token: string): Promise<{ id: string } | null> {
    const id = this.tokens.get(token);
    return Promise.resolve(id ? { id } : null);
  }

  async getMembership(roomId: string, userId: string): Promise<PlayerRole | null> {
    const r = await this.db.query<{ role: PlayerRole }>(
      'select role from public.room_members where room_id = $1 and user_id = $2',
      [roomId, userId],
    );
    return r.rows[0]?.role ?? null;
  }

  async getState(roomId: string) {
    const r = await this.db.query<{ snapshot: FloodSnapshot; revision: number }>(
      'select snapshot, revision from public.mission_state where room_id = $1',
      [roomId],
    );
    return r.rows[0] ?? null;
  }

  async findEvent(roomId: string, eventId: string): Promise<StoredEvent | null> {
    const r = await this.db.query<
      { event_id: string; actor_id: string; action: unknown; result: 'accepted' | 'denied'; reason: string | null; revision: number }
    >(
      'select event_id, actor_id, action, result, reason, revision from public.mission_events where room_id = $1 and event_id = $2',
      [roomId, eventId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      eventId: row.event_id,
      actorId: row.actor_id,
      action: row.action,
      result: row.result,
      reason: row.reason,
      revision: row.revision,
    };
  }

  async listEvents(roomId: string): Promise<AppliedEvent[]> {
    const r = await this.db.query<
      { event_id: string; actor_role: PlayerRole; action: AppliedEvent['action']; result: 'accepted' | 'denied'; reason: string | null; revision: number; created_at: string }
    >(
      'select event_id, actor_role, action, result, reason, revision, created_at from public.mission_events where room_id = $1 order by seq',
      [roomId],
    );
    return r.rows.map((row) => {
      const ev: AppliedEvent = {
        eventId: row.event_id,
        revision: row.revision,
        actorRole: row.actor_role,
        action: row.action,
        result: row.result,
        nowUtc: new Date(row.created_at).toISOString(),
      };
      if (row.reason) ev.code = row.reason as AppliedEvent['code'];
      return ev;
    });
  }

  async commit(input: CommitInput): Promise<CommitResult> {
    const r = await this.db.query<{ r: CommitResult }>(
      'select public.commit_mission_event($1::uuid, $2, $3::uuid, $4, $5::jsonb, $6::int, $7, $8, $9::jsonb, $10::jsonb) as r',
      [
        input.roomId, input.eventId, input.actorId, input.actorRole, JSON.stringify(input.action),
        input.expectedRevision, input.result, input.reason,
        input.newSnapshot ? JSON.stringify(input.newSnapshot) : null,
        input.report ? JSON.stringify(input.report) : null,
      ],
    );
    return r.rows[0].r;
  }

  async createRoom(input: CreateRoomInput): Promise<CreateRoomResult> {
    try {
      const r = await this.db.query<{ r: CreateRoomResult }>(
        'select public.create_room_with_state($1::uuid, $2::uuid, $3, $4, $5::jsonb) as r',
        [input.roomId, input.ownerId, input.role, input.scenarioId, JSON.stringify(input.snapshot)],
      );
      return r.rows[0].r;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new StoreError(message.includes('rate_limited') ? 'rate_limited' : 'internal', message);
    }
  }
}
