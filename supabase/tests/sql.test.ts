// Pruebas de seguridad a nivel SQL: RLS, permisos de tabla y de función, límites.
//   deno test --allow-read supabase/tests/sql.test.ts   (ver supabase/README.md)

import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1.0.6';
import type { PGlite } from 'npm:@electric-sql/pglite@0.2.17';
import { createInitialSnapshot } from '../functions/_shared/engine.ts';
import { asRole, setupDb } from './pgliteStore.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const ROOM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function withRoom(): Promise<{ db: PGlite; code: string }> {
  const db = await setupDb();
  const snap = JSON.stringify(createInitialSnapshot(ROOM, 'A1'));
  const r = await db.query<{ r: { joinCode: string } }>(
    'select public.create_room_with_state($1::uuid, $2::uuid, $3, $4, $5::jsonb) as r',
    [ROOM, A, 'ground', 'A1', snap],
  );
  await asRole(db, 'authenticated', B, () => db.query('select public.join_room($1)', [r.rows[0].r.joinCode]));
  return { db, code: r.rows[0].r.joinCode };
}

const TABLES = ['mission_rooms', 'room_members', 'mission_state', 'mission_events', 'observations', 'mission_reports'];

Deno.test('B04 RLS: un usuario ajeno no lee ninguna tabla; los miembros solo lo suyo', async () => {
  const { db } = await withRoom();
  // Un evento y una observación para que haya filas que proteger.
  await db.query(
    `insert into public.mission_events (event_id, room_id, actor_id, actor_role, action, result, revision)
     values ('e1', $1, $2, 'ground', '{}'::jsonb, 'accepted', 1)`, [ROOM, A]);
  for (const table of TABLES) {
    const outsider = await asRole(db, 'authenticated', C, async () =>
      (await db.query(`select * from public.${table}`)).rows.length);
    assertEquals(outsider, 0, `${table}: el ajeno no debe ver filas`);
    const member = await asRole(db, 'authenticated', B, async () =>
      (await db.query(`select * from public.${table}`)).rows.length);
    if (table !== 'observations' && table !== 'mission_reports') assert(member >= 1, `${table}: el miembro sí ve su sala`);
  }
  // El rol anon (sin sesión) no tiene ni SELECT.
  for (const table of TABLES) {
    await assertRejects(
      () => asRole(db, 'anon', null, () => db.query(`select * from public.${table}`)),
      Error, 'permission denied', `${table}: anon sin acceso`);
  }
});

Deno.test('ningún cliente puede escribir: sin INSERT/UPDATE/DELETE para authenticated', async () => {
  const { db } = await withRoom();
  const attempts = [
    `update public.mission_state set revision = 99`,
    `delete from public.mission_state`,
    `insert into public.mission_state (room_id, snapshot) values (gen_random_uuid(), '{}')`,
    `update public.room_members set role = 'ground'`,
    `delete from public.room_members`,
    `insert into public.room_members (room_id, user_id, role) values ('${ROOM}', '${C}', 'ground')`,
    `insert into public.mission_events (event_id, room_id, actor_id, actor_role, action, result, revision) values ('x','${ROOM}','${B}','satellite','{}','accepted',1)`,
    `update public.mission_reports set finding = 'normal'`,
    `insert into public.join_attempts (user_id) values ('${B}')`,
    `select * from public.join_attempts`,
  ];
  for (const sql of attempts) {
    await assertRejects(() => asRole(db, 'authenticated', B, () => db.query(sql)), Error, 'permission denied', sql);
  }
  const state = await db.query<{ revision: number }>('select revision from public.mission_state');
  assertEquals(state.rows[0].revision, 0);
});

Deno.test('create_room_with_state y commit_mission_event no son ejecutables por el cliente', async () => {
  const { db } = await withRoom();
  const snap = JSON.stringify(createInitialSnapshot(crypto.randomUUID(), 'A1'));
  for (const role of ['authenticated', 'anon'] as const) {
    await assertRejects(
      () => asRole(db, role, B, () => db.query(
        'select public.create_room_with_state($1::uuid, $2::uuid, $3, $4, $5::jsonb)',
        [crypto.randomUUID(), B, 'ground', 'A1', snap])),
      Error, 'permission denied', `${role} crea sala`);
    await assertRejects(
      () => asRole(db, role, B, () => db.query(
        `select public.commit_mission_event($1::uuid, 'evil', $2::uuid, 'satellite', '{}'::jsonb, 0, 'accepted', null, '{"revision":1}'::jsonb, null)`,
        [ROOM, B])),
      Error, 'permission denied', `${role} confirma evento`);
  }
  await assertRejects(
    () => asRole(db, 'anon', null, () => db.query('select public.join_room($1)', ['ABC123'])),
    Error, 'permission denied', 'anon no puede unirse');
  // service_role sí (lo usa la Edge Function).
  const ok = await asRole(db, 'service_role', null, async () =>
    (await db.query('select public.is_room_member($1::uuid) as m', [ROOM])).rows.length);
  assertEquals(ok, 1);
});

Deno.test('join_room: sin sesión falla; código inexistente no revela nada; límite de intentos', async () => {
  const { db } = await withRoom();
  await assertRejects(
    () => asRole(db, 'authenticated', null, () => db.query('select public.join_room($1)', ['ABC123'])),
    Error, 'not_authenticated');
  let last: { status: string } = { status: '' };
  for (let i = 0; i < 10; i++) {
    last = await asRole(db, 'authenticated', C, async () =>
      (await db.query<{ r: { status: string } }>('select public.join_room($1) as r', [`BAD${i}00`])).rows[0].r);
    assertEquals(last.status, 'room_not_found');
  }
  const blocked = await asRole(db, 'authenticated', C, async () =>
    (await db.query<{ r: { status: string } }>('select public.join_room($1) as r', ['ZZZZZZ'])).rows[0].r);
  assertEquals(blocked.status, 'rate_limited');
});

Deno.test('create_room_with_state valida el snapshot y limita las salas por usuario', async () => {
  const db = await setupDb();
  const create = (roomId: string, owner: string, scenario: string, snapshot: unknown, role = 'ground') =>
    db.query('select public.create_room_with_state($1::uuid, $2::uuid, $3, $4, $5::jsonb)',
      [roomId, owner, role, scenario, JSON.stringify(snapshot)]);
  const id = crypto.randomUUID();
  const base = createInitialSnapshot(id, 'A1');
  await assertRejects(() => create(id, A, 'A1', { ...base, revision: 5 }), Error, 'snapshot_inconsistent');
  await assertRejects(() => create(id, A, 'A1', { ...base, status: 'won' }), Error, 'snapshot_inconsistent');
  await assertRejects(() => create(id, A, 'A1', { ...base, phase: 'debrief' }), Error, 'snapshot_inconsistent');
  await assertRejects(() => create(id, A, 'A2', base), Error, 'snapshot_inconsistent', 'escenario distinto');
  await assertRejects(() => create(crypto.randomUUID(), A, 'A1', base), Error, 'snapshot_inconsistent', 'otra sala');
  await assertRejects(() => create(id, A, 'A1', base, 'admin'), Error, 'invalid_role');
  const rooms = await db.query('select * from public.mission_rooms');
  assertEquals(rooms.rows.length, 0, 'los intentos inválidos no dejan salas a medias');

  for (let i = 0; i < 10; i++) {
    const rid = crypto.randomUUID();
    await create(rid, A, 'A1', createInitialSnapshot(rid, 'A1'));
  }
  const rid = crypto.randomUUID();
  await assertRejects(() => create(rid, A, 'A1', createInitialSnapshot(rid, 'A1')), Error, 'rate_limited');
});

Deno.test('commit_mission_event: no miembro, estado inconsistente y límites', async () => {
  const { db } = await withRoom();
  const commit = (actor: string, role: string, eventId: string, rev: number, snap: unknown, result = 'accepted', report: unknown = null) =>
    db.query<{ r: { status: string } }>(
      'select public.commit_mission_event($1::uuid, $2, $3::uuid, $4, $5::jsonb, $6::int, $7, $8, $9::jsonb, $10::jsonb) as r',
      [ROOM, eventId, actor, role, JSON.stringify({ type: 'RESET_MISSION' }), rev, result, null,
        snap ? JSON.stringify(snap) : null, report ? JSON.stringify(report) : null]);
  const next = { ...createInitialSnapshot(ROOM, 'A1'), revision: 1 };

  assertEquals((await commit(C, 'ground', 'e-1', 0, next)).rows[0].r.status, 'not_member');
  assertEquals((await commit(B, 'ground', 'e-1', 0, next)).rows[0].r.status, 'not_member', 'rol que no es el suyo');
  await assertRejects(() => commit(A, 'ground', 'e-1', 0, { ...next, revision: 7 }), Error, 'snapshot_revision_mismatch');
  await assertRejects(() => commit(A, 'ground', 'e-1', 0, { ...next, roomId: crypto.randomUUID() }), Error, 'snapshot_room_mismatch');
  await assertRejects(() => commit(A, 'ground', 'e-1', 0, null), Error, 'accepted_requires_snapshot');
  await assertRejects(() => commit(A, 'ground', '', 0, next), Error, 'invalid_event_id');
  await assertRejects(() => commit(A, 'ground', 'e-1', 0, next, 'accepted', { reportId: 'R', finding: 'normal' }), Error, 'report_only_on_submit');
  const events = await db.query('select * from public.mission_events');
  assertEquals(events.rows.length, 0, 'ningún intento inválido dejó rastro');
  assertEquals((await commit(A, 'ground', 'e-1', 0, next)).rows[0].r.status, 'accepted');
  assertEquals((await commit(A, 'ground', 'e-1', 0, next)).rows[0].r.status, 'duplicate');
  assertEquals((await commit(A, 'ground', 'e-1', 1, next)).rows[0].r.status, 'duplicate', 'el duplicado se resuelve antes que la revisión');
  assertEquals((await commit(B, 'satellite', 'e-1', 0, next)).rows[0].r.status, 'conflict_payload', 'otro actor, mismo id');
  assertEquals((await commit(A, 'ground', 'e-2', 0, { ...next, revision: 2 })).rows[0].r.status, 'stale');
});

Deno.test('mission_events lleva orden estricto (seq) y Realtime publica solo mission_state', async () => {
  const { db } = await withRoom();
  for (let i = 1; i <= 3; i++) {
    await db.query(
      `select public.commit_mission_event($1::uuid, $2, $3::uuid, 'ground', '{"type":"RESET_MISSION"}'::jsonb, $4::int, 'accepted', null, $5::jsonb, null)`,
      [ROOM, `e-${i}`, A, i - 1, JSON.stringify({ ...createInitialSnapshot(ROOM, 'A1'), revision: i })]);
  }
  const order = await db.query<{ event_id: string }>('select event_id from public.mission_events order by seq');
  assertEquals(order.rows.map((r) => r.event_id), ['e-1', 'e-2', 'e-3']);
  const pub = await db.query<{ tablename: string }>(
    "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1");
  assertEquals(pub.rows.map((r) => r.tablename), ['mission_state']);
});

Deno.test('el código de sala usa el alfabeto sin ambigüedades y no se repite', async () => {
  const db = await setupDb();
  const codes = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const rid = crypto.randomUUID();
    const owner = crypto.randomUUID(); // un usuario distinto por sala: evita el límite por usuario
    const r = await db.query<{ r: { joinCode: string } }>(
      'select public.create_room_with_state($1::uuid, $2::uuid, $3, $4, $5::jsonb) as r',
      [rid, owner, 'ground', 'A1', JSON.stringify(createInitialSnapshot(rid, 'A1'))]);
    assert(/^[A-HJKMNP-Z2-9]{6}$/.test(r.rows[0].r.joinCode));
    codes.add(r.rows[0].r.joinCode);
  }
  assertEquals(codes.size, 25);
});
