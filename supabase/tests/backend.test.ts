// Pruebas de aceptación del backend (casos B01-B14 del documento del Rol 02).
// Ejecutan los manejadores reales contra las migraciones SQL reales (PGlite).
//   deno test --allow-read --allow-env=NODE_V8_COVERAGE supabase/tests/backend.test.ts   (ver supabase/README.md)

import { assert, assertEquals, assertNotEquals } from 'jsr:@std/assert@1.0.6';
import { handleCreateRoom } from '../functions/_shared/createRoom.ts';
import { handleDispatchAction } from '../functions/_shared/dispatchAction.ts';
import type { FunctionDeps } from '../functions/_shared/http.ts';
import type { FloodSnapshot } from '../functions/_shared/engine.ts';
import type { CommitInput, CommitResult } from '../functions/_shared/store.ts';
import { asRole, PgliteStore, setupDb } from './pgliteStore.ts';

const ORIGIN = 'http://localhost:5173';
const A = '11111111-1111-4111-8111-111111111111'; // anfitrión (ground)
const B = '22222222-2222-4222-8222-222222222222'; // invitado (satellite)
const C = '33333333-3333-4333-8333-333333333333'; // ajeno a la sala

type Json = Record<string, any>;

class Harness {
  store!: PgliteStore;
  deps!: FunctionDeps;
  roomId = '';
  joinCode = '';
  private n = 0;
  private revision = new Map<string, number>();

  static async create(): Promise<Harness> {
    const h = new Harness();
    h.store = new PgliteStore(await setupDb());
    h.store.tokens.set('tokA', A).set('tokB', B).set('tokC', C);
    h.deps = {
      store: h.store,
      now: () => new Date('2026-11-15T12:00:00.000Z'),
      allowedOrigins: [ORIGIN],
      uuid: () => crypto.randomUUID(),
    };
    return h;
  }

  req(token: string | null, body: unknown, method = 'POST'): Request {
    const headers: Record<string, string> = { 'content-type': 'application/json', origin: ORIGIN };
    if (token) headers.authorization = `Bearer ${token}`;
    return new Request('http://localhost/fn', {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    });
  }

  async createRoom(token: string, scenarioId: 'A1' | 'A2', preferredRole?: 'ground' | 'satellite') {
    const res = await handleCreateRoom(this.req(token, { scenarioId, preferredRole }), this.deps);
    const body = (await res.json()) as Json;
    if (res.status === 200) {
      this.roomId = body.roomId;
      this.joinCode = body.joinCode;
    }
    return { res, body };
  }

  /** Une al usuario con el RPC join_room, como lo haría el navegador (rol authenticated). */
  async join(userId: string, code = this.joinCode): Promise<Json> {
    return await asRole(this.store.db, 'authenticated', userId, async () => {
      const r = await this.store.db.query<{ r: Json }>('select public.join_room($1) as r', [code]);
      return r.rows[0].r;
    });
  }

  /** Despacha una acción; si no se indican actionId/expectedRevision usa los vigentes. */
  async act(
    token: string,
    actorRole: 'ground' | 'satellite',
    type: string,
    payload: Json = {},
    opts: { actionId?: string; expectedRevision?: number } = {},
  ) {
    const actionId = opts.actionId ?? `act-${++this.n}`;
    const expectedRevision = opts.expectedRevision ?? (await this.currentRevision());
    const res = await handleDispatchAction(
      this.req(token, { roomId: this.roomId, action: { actionId, actorRole, expectedRevision, type, payload } }),
      this.deps,
    );
    return { res, body: (await res.json()) as Json, actionId };
  }

  async currentRevision(): Promise<number> {
    return (await this.store.getState(this.roomId))!.revision;
  }

  async snapshot(): Promise<FloodSnapshot> {
    return (await this.store.getState(this.roomId))!.snapshot;
  }

  async count(table: string): Promise<number> {
    const r = await this.store.db.query<{ n: number }>(
      `select count(*)::int as n from public.${table} where ${table === 'mission_rooms' ? 'id' : 'room_id'} = $1`,
      [this.roomId],
    );
    return r.rows[0].n;
  }

  /** Dos jugadores en la sala: A = ground, B = satellite. */
  static async withRoom(scenarioId: 'A1' | 'A2'): Promise<Harness> {
    const h = await Harness.create();
    const created = await h.createRoom('tokA', scenarioId, 'ground');
    assertEquals(created.res.status, 200);
    assertEquals((await h.join(B)).status, 'joined');
    return h;
  }

  /** Un ciclo completo de observación válida: pedir, aprobar, capturar, pedir envío, enviar, clasificar. */
  async cycle(targetId: string, obsId: string, finding: string, profileId = 'standard') {
    const steps = [
      await this.act('tokA', 'ground', 'REQUEST_OBSERVATION', { targetId }),
      await this.act('tokB', 'satellite', 'APPROVE_PLAN', { profileId }),
      await this.act('tokB', 'satellite', 'CAPTURE_IMAGE', { targetId }),
      await this.act('tokA', 'ground', 'REQUEST_TRANSMISSION', { observationId: obsId }),
      await this.act('tokB', 'satellite', 'TRANSMIT_IMAGE', { observationId: obsId }),
      await this.act('tokA', 'ground', 'CLASSIFY_IMAGE', { observationId: obsId, finding }),
    ];
    return steps;
  }
}

// ───────────────────────────── B01-B03: sala y membresía ─────────────────────────────

Deno.test('B01 crear sala autenticada devuelve roomId, joinCode, rol y revisión 0', async () => {
  const h = await Harness.create();
  const { res, body } = await h.createRoom('tokA', 'A1', 'ground');
  assertEquals(res.status, 200);
  assertEquals(body.role, 'ground');
  assertEquals(body.revision, 0);
  assert(/^[0-9a-f-]{36}$/.test(body.roomId));
  assert(/^[A-HJKMNP-Z2-9]{6}$/.test(body.joinCode), `código inesperado: ${body.joinCode}`);
  const snap = await h.snapshot();
  assertEquals(snap.revision, 0);
  assertEquals(snap.phase, 'briefing');
  assertEquals(snap.scenarioId, 'A1');
});

Deno.test('B01b crear sala sin sesión: 401; escenario inválido: 400', async () => {
  const h = await Harness.create();
  const noAuth = await handleCreateRoom(h.req(null, { scenarioId: 'A1' }), h.deps);
  assertEquals(noAuth.status, 401);
  const badToken = await handleCreateRoom(h.req('tok-falso', { scenarioId: 'A1' }), h.deps);
  assertEquals(badToken.status, 401);
  const badScenario = await handleCreateRoom(h.req('tokA', { scenarioId: 'B9' }), h.deps);
  assertEquals(badScenario.status, 400);
  const extraKey = await handleCreateRoom(h.req('tokA', { scenarioId: 'A1', ownerUserId: C }), h.deps);
  assertEquals(extraKey.status, 400, 'no se acepta ownerUserId del navegador');
  const owner = await h.store.db.query('select 1 from public.mission_rooms');
  assertEquals(owner.rows.length, 0, 'ninguna sala creada en los casos rechazados');
});

Deno.test('B02 unirse con código válido desde otro usuario: roles distintos, sala compartida', async () => {
  const h = await Harness.create();
  await h.createRoom('tokA', 'A1', 'ground');
  const joined = await h.join(B);
  assertEquals(joined.status, 'joined');
  assertEquals(joined.role, 'satellite');
  assertEquals(joined.roomId, h.roomId);
  assertEquals((await h.join(B)).status, 'already_member');
  assertEquals((await h.join(B, h.joinCode.toLowerCase())).status, 'already_member');
});

Deno.test('B03 tercer usuario: room_full y sin acceso a estado ni acciones', async () => {
  const h = await Harness.withRoom('A1');
  assertEquals((await h.join(C)).status, 'room_full');
  const { res } = await h.act('tokC', 'ground', 'RESET_MISSION');
  assertEquals(res.status, 403);
  const rows = await asRole(h.store.db, 'authenticated', C, async () =>
    (await h.store.db.query('select * from public.mission_state')).rows);
  assertEquals(rows.length, 0);
});

// ───────────────────────────── B05: roles ─────────────────────────────

Deno.test('B05 ground intenta CAPTURE_IMAGE: rechazo sin cambiar el snapshot', async () => {
  const h = await Harness.withRoom('A1');
  const before = await h.snapshot();
  const { res, body } = await h.act('tokA', 'ground', 'CAPTURE_IMAGE', { targetId: 'piura-rio' });
  assertEquals(res.status, 422);
  assertEquals(body.code, 'ACTION_DENIED');
  assertEquals(body.denialCode, 'WRONG_ROLE');
  assertEquals(await h.snapshot(), before);
  assertEquals(await h.currentRevision(), 0);
});

Deno.test('B05b el rol del navegador no es autorización: satellite diciendo ser ground => 403', async () => {
  const h = await Harness.withRoom('A1');
  const { res, body } = await h.act('tokB', 'ground', 'REQUEST_OBSERVATION', { targetId: 'piura-rio' });
  assertEquals(res.status, 403);
  assertEquals(body.code, 'NOT_AUTHORIZED');
  assertEquals(await h.currentRevision(), 0);
  assertEquals(await h.count('mission_events'), 0, 'un intento no autorizado no deja evento');
});

// ───────────────────────────── B06/B07/B13: partidas completas ─────────────────────────────

Deno.test('B06 A1 completa desde dos clientes: ganada, recursos y puntaje coherentes', async () => {
  const h = await Harness.withRoom('A1');
  for (const s of await h.cycle('piura-rio', 'obs-1', 'possible_flood')) assertEquals(s.res.status, 200, JSON.stringify(s.body));
  for (const s of await h.cycle('piura-urbano', 'obs-2', 'possible_flood')) assertEquals(s.res.status, 200, JSON.stringify(s.body));
  const done = await h.act('tokA', 'ground', 'SUBMIT_REPORT', { reportId: 'REP-A1' });
  assertEquals(done.res.status, 200, JSON.stringify(done.body));
  const snap = done.body.snapshot as FloodSnapshot;
  assertEquals(snap.status, 'won');
  assertEquals(snap.phase, 'debrief');
  // 100 Wh - 2*12 captura - 2*4 envío = 68; 70 MB - 2*14 = 42; 80 s - 2*28 = 24; 100 - 2*10 = 80
  assertEquals(snap.resources, { energyWh: 68, storageMb: 42, contactSeconds: 24, budgetCredits: 80, massKg: 0 });
  assertEquals(snap.reportFinding, 'possible_flood');
  const rep = await h.store.db.query<{ finding: string; score: { total: number }; evidence: string[] }>(
    'select finding, score, evidence from public.mission_reports where room_id = $1', [h.roomId]);
  assertEquals(rep.rows.length, 1);
  assertEquals(rep.rows[0].score.total, 100);
  assertEquals(rep.rows[0].evidence, ['obs-1', 'obs-2']);
  assertEquals(await h.count('observations'), 2);
});

Deno.test('B07 A2 con primera toma nublada: no se puede afirmar inundación con evidencia inválida', async () => {
  const h = await Harness.withRoom('A2');
  const steps = await h.cycle('piura-rio', 'obs-1', 'possible_flood');
  const last = steps[steps.length - 1];
  assertEquals(last.res.status, 422);
  assertEquals(last.body.denialCode, 'INVALID_EVIDENCE');
  assertEquals((await h.snapshot()).observations[0].quality, 'cloudy');
  const ok = await h.act('tokA', 'ground', 'CLASSIFY_IMAGE', { observationId: 'obs-1', finding: 'insufficient' });
  assertEquals(ok.res.status, 200);
});

Deno.test('B13 informe: la conclusión sale de las evidencias válidas, no de lo que diga el cliente', async () => {
  const h = await Harness.withRoom('A2');
  await h.cycle('piura-rio', 'obs-1', 'possible_flood'); // nublada: el último paso se deniega
  await h.act('tokA', 'ground', 'CLASSIFY_IMAGE', { observationId: 'obs-1', finding: 'insufficient' });
  const done = await h.act('tokA', 'ground', 'SUBMIT_REPORT', { finding: 'possible_flood', reportId: 'REP-FALSO' });
  assertEquals(done.res.status, 200);
  const snap = done.body.snapshot as FloodSnapshot;
  assertEquals(snap.reportFinding, 'insufficient', 'el motor ignora el finding enviado');
  assertEquals(snap.status, 'lost');
  const rep = await h.store.db.query<{ finding: string; evidence: string[]; score: { total: number } }>(
    'select finding, evidence, score from public.mission_reports where room_id = $1', [h.roomId]);
  assertEquals(rep.rows[0].finding, 'insufficient');
  assertEquals(rep.rows[0].evidence, []);
  assert(rep.rows[0].score.total < 100);
});

Deno.test('B13b los alias de zona no penalizan una clasificación correcta (puntaje en el servidor)', async () => {
  const h = await Harness.withRoom('A1');
  for (const s of await h.cycle('rio-piura', 'obs-1', 'possible_flood', 'optico-submetrico')) assertEquals(s.res.status, 200, JSON.stringify(s.body));
  for (const s of await h.cycle('piura-urbano', 'obs-2', 'possible_flood')) assertEquals(s.res.status, 200, JSON.stringify(s.body));
  await h.act('tokA', 'ground', 'SUBMIT_REPORT', { reportId: 'REP-ALIAS' });
  const rep = await h.store.db.query<{ score: { total: number; breakdown: { rigor: number } } }>(
    'select score from public.mission_reports where room_id = $1', [h.roomId]);
  assertEquals(rep.rows[0].score.breakdown.rigor, 30);
  assertEquals(rep.rows[0].score.total, 100);
});

// ───────────────────────────── B08/B09/B10: idempotencia y concurrencia ─────────────────────────────

Deno.test('B08 acción repetida con el mismo actionId: no se aplica ni se cobra dos veces', async () => {
  const h = await Harness.withRoom('A1');
  await h.act('tokA', 'ground', 'REQUEST_OBSERVATION', { targetId: 'piura-rio' }, { actionId: 'a-req' });
  const first = await h.act('tokB', 'satellite', 'APPROVE_PLAN', { profileId: 'standard' }, { actionId: 'a-plan' });
  assertEquals(first.res.status, 200);
  const cap = await h.act('tokB', 'satellite', 'CAPTURE_IMAGE', { targetId: 'piura-rio' }, { actionId: 'a-cap' });
  assertEquals(cap.res.status, 200);
  const after = await h.snapshot();
  assertEquals(after.resources.energyWh, 88);
  const revision = await h.currentRevision();
  const events = await h.count('mission_events');

  // Reintento por red: mismo actionId, mismo contenido y la misma revisión esperada de entonces.
  const retry = await h.act('tokB', 'satellite', 'CAPTURE_IMAGE', { targetId: 'piura-rio' }, { actionId: 'a-cap', expectedRevision: revision - 1 });
  assertEquals(retry.res.status, 200);
  assertEquals(retry.body.duplicate, true);
  assertEquals(retry.body.snapshot.revision, revision);
  assertEquals((await h.snapshot()).resources.energyWh, 88, 'no se cobra dos veces');
  assertEquals(await h.currentRevision(), revision);
  assertEquals(await h.count('mission_events'), events);
  assertEquals((await h.snapshot()).observations.length, 1);
});

Deno.test('B08b reintento de una acción denegada devuelve la misma denegación', async () => {
  const h = await Harness.withRoom('A1');
  const one = await h.act('tokA', 'ground', 'CAPTURE_IMAGE', { targetId: 'piura-rio' }, { actionId: 'a-bad' });
  const two = await h.act('tokA', 'ground', 'CAPTURE_IMAGE', { targetId: 'piura-rio' }, { actionId: 'a-bad' });
  assertEquals(one.res.status, 422);
  assertEquals(two.res.status, 422);
  assertEquals(two.body.denialCode, 'WRONG_ROLE');
  assertEquals(two.body.duplicate, true);
  assertEquals(await h.count('mission_events'), 1);
});

Deno.test('B09 mismo actionId con contenido distinto: rechazo sin corromper el historial', async () => {
  const h = await Harness.withRoom('A1');
  await h.act('tokA', 'ground', 'REQUEST_OBSERVATION', { targetId: 'piura-rio' }, { actionId: 'a-1' });
  const before = await h.snapshot();
  const clash = await h.act('tokA', 'ground', 'REQUEST_OBSERVATION', { targetId: 'piura-urbano' }, { actionId: 'a-1', expectedRevision: 0 });
  assertEquals(clash.res.status, 409);
  assertEquals(clash.body.code, 'DUPLICATE_ACTION');
  assertEquals(await h.snapshot(), before);
  assertEquals(await h.count('mission_events'), 1);
  // Otro usuario tampoco puede reutilizar el actionId ajeno.
  const stolen = await h.act('tokB', 'satellite', 'APPROVE_PLAN', { profileId: 'standard' }, { actionId: 'a-1' });
  assertEquals(stolen.res.status, 409);
});

Deno.test('B10 dos acciones con la misma expectedRevision: solo una confirma', async () => {
  const h = await Harness.withRoom('A1');
  const one = await h.act('tokA', 'ground', 'RESET_MISSION', {}, { expectedRevision: 0 });
  const two = await h.act('tokB', 'satellite', 'RESET_MISSION', {}, { expectedRevision: 0 });
  assertEquals(one.res.status, 200);
  assertEquals(two.res.status, 409);
  assertEquals(two.body.code, 'REVISION_CONFLICT');
  assertEquals(two.body.revision, 1);
  assertEquals(two.body.snapshot.revision, 1, 'el conflicto trae el snapshot vigente');
});

Deno.test('B10b carrera real: el estado cambia entre la lectura y el commit => SQL devuelve stale', async () => {
  const h = await Harness.withRoom('A1');
  let interleaved = false;
  const store = h.store;
  const original = store.getState.bind(store);
  store.getState = async (roomId: string) => {
    const state = await original(roomId);
    if (!interleaved) {
      interleaved = true;
      // Mientras A calcula, B confirma otra acción con la misma revisión de partida.
      await h.act('tokB', 'satellite', 'RESET_MISSION', {}, { expectedRevision: 0 });
    }
    return state;
  };
  const { res, body } = await h.act('tokA', 'ground', 'RESET_MISSION', {}, { expectedRevision: 0 });
  assertEquals(interleaved, true);
  assertEquals(res.status, 409);
  assertEquals(body.code, 'REVISION_CONFLICT');
  assertEquals(await h.currentRevision(), 1, 'solo se aplicó una de las dos');
});

// ───────────────────────────── B11/B12: reconexión y fallos ─────────────────────────────

Deno.test('B11 reconexión: el snapshot leído coincide con el confirmado y no se duplican eventos', async () => {
  const h = await Harness.withRoom('A1');
  const a = await h.act('tokA', 'ground', 'REQUEST_OBSERVATION', { targetId: 'piura-rio' });
  const reread = await h.snapshot();
  assertEquals(reread, a.body.snapshot);
  const events = await h.count('mission_events');
  const replay = await h.act('tokA', 'ground', 'REQUEST_OBSERVATION', { targetId: 'piura-rio' }, { actionId: a.actionId, expectedRevision: 0 });
  assertEquals(replay.res.status, 200);
  assertEquals(await h.count('mission_events'), events);
});

Deno.test('B12 fallo del almacén: error recuperable, sin éxito falso y sin cambiar el estado', async () => {
  const h = await Harness.withRoom('A1');
  const original = h.store.commit.bind(h.store);
  h.store.commit = (_input: CommitInput): Promise<CommitResult> => Promise.reject(new Error('conexión caída'));
  const { res, body } = await h.act('tokA', 'ground', 'REQUEST_OBSERVATION', { targetId: 'piura-rio' }, { actionId: 'a-retry' });
  assertEquals(res.status, 500);
  assertEquals(body.code, 'TRANSPORT_ERROR');
  assert(!JSON.stringify(body).includes('conexión caída'), 'el error interno no llega al cliente');
  assertEquals(await h.currentRevision(), 0);
  // Recuperación: mismo actionId, ya con el almacén sano.
  h.store.commit = original;
  const retry = await h.act('tokA', 'ground', 'REQUEST_OBSERVATION', { targetId: 'piura-rio' }, { actionId: 'a-retry', expectedRevision: 0 });
  assertEquals(retry.res.status, 200);
  assertEquals(await h.currentRevision(), 1);
});

// ───────────────────────────── Validación, CORS, límites ─────────────────────────────

Deno.test('dispatch rechaza cuerpos y acciones mal formados con 4xx estables', async () => {
  const h = await Harness.withRoom('A1');
  const send = async (body: unknown, token: string | null = 'tokA') =>
    (await handleDispatchAction(h.req(token, body), h.deps)).status;
  const good = { actionId: 'x-1', actorRole: 'ground', expectedRevision: 0, type: 'REQUEST_OBSERVATION', payload: { targetId: 'piura-rio' } };

  assertEquals(await send({ roomId: h.roomId, action: good }, null), 401);
  assertEquals(await send({ roomId: 'no-es-uuid', action: good }), 400);
  assertEquals(await send({ roomId: h.roomId }), 400);
  assertEquals(await send({ roomId: h.roomId, action: good, extra: 1 }), 400);
  assertEquals(await send({ roomId: h.roomId, action: { ...good, extra: 'x' } }), 400, 'campos extra en la acción');
  assertEquals(await send({ roomId: h.roomId, action: { ...good, payload: { targetId: 'piura-rio', basura: 1 } } }), 400);
  assertEquals(await send({ roomId: h.roomId, action: { ...good, type: 'HACK' } }), 400);
  assertEquals(await send({ roomId: h.roomId, action: { ...good, actionId: 'a'.repeat(101) } }), 400);
  assertEquals(await send({ roomId: h.roomId, action: { ...good, payload: { targetId: 'a'.repeat(5000) } } }), 413);
  assertEquals(await send({ roomId: h.roomId, action: { ...good, expectedRevision: -1 } }), 400);
  assertEquals(await send({ roomId: h.roomId, action: { ...good, expectedRevision: 1.5 } }), 400);
  assertEquals(await send({ roomId: h.roomId, action: { ...good, actorRole: 'admin' } }), 400);
  assertEquals(await send({ roomId: crypto.randomUUID(), action: good }), 403, 'sala inexistente = no miembro');
  const bad = await handleDispatchAction(
    new Request('http://localhost/fn', { method: 'POST', headers: { authorization: 'Bearer tokA' }, body: '{no es json' }),
    h.deps,
  );
  assertEquals(bad.status, 400);
  const get = await handleDispatchAction(h.req('tokA', null, 'GET'), h.deps);
  assertEquals(get.status, 405);
  assertEquals(await h.count('mission_events'), 0, 'ninguna entrada inválida llegó a la base');
});

Deno.test('CORS: solo los orígenes permitidos reciben Access-Control-Allow-Origin', async () => {
  const h = await Harness.create();
  const ok = await handleDispatchAction(
    new Request('http://localhost/fn', { method: 'OPTIONS', headers: { origin: ORIGIN } }), h.deps);
  assertEquals(ok.status, 204);
  assertEquals(ok.headers.get('access-control-allow-origin'), ORIGIN);
  const evil = await handleDispatchAction(
    new Request('http://localhost/fn', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), h.deps);
  assertEquals(evil.headers.get('access-control-allow-origin'), null);
  const err = await handleDispatchAction(
    new Request('http://localhost/fn', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }), h.deps);
  assertEquals(err.status, 401);
  assertEquals(err.headers.get('access-control-allow-origin'), null);
});

Deno.test('RESET_MISSION conserva miembros, borra observaciones e informes y permite otra partida', async () => {
  const h = await Harness.withRoom('A1');
  await h.cycle('piura-rio', 'obs-1', 'possible_flood');
  await h.cycle('piura-urbano', 'obs-2', 'possible_flood');
  await h.act('tokA', 'ground', 'SUBMIT_REPORT', { reportId: 'REP-1' });
  assertEquals(await h.count('mission_reports'), 1);
  const reset = await h.act('tokB', 'satellite', 'RESET_MISSION', { scenarioId: 'A2' });
  assertEquals(reset.res.status, 200);
  assertEquals((reset.body.snapshot as FloodSnapshot).scenarioId, 'A2');
  assertEquals(await h.count('observations'), 0);
  assertEquals(await h.count('mission_reports'), 0);
  assertEquals(await h.count('room_members'), 2);
  // El informe de la nueva partida se guarda aunque reutilice el id anterior.
  await h.cycle('piura-agricola', 'obs-1', 'normal');
  const rep = await h.act('tokA', 'ground', 'SUBMIT_REPORT', { reportId: 'REP-1' });
  assertEquals(rep.res.status, 200);
  assertEquals(await h.count('mission_reports'), 1);
  assertNotEquals((await h.snapshot()).status, 'ready');
});

// ───────────────────────────── B14: sin claves de servicio en el cliente ─────────────────────────────

Deno.test('B14 el código del navegador no contiene la clave de servicio', async () => {
  const root = new URL('../../', import.meta.url);
  const offenders: string[] = [];
  const scan = async (dir: URL) => {
    for await (const entry of Deno.readDir(dir)) {
      const url = new URL(entry.name + (entry.isDirectory ? '/' : ''), dir);
      if (entry.isDirectory) await scan(url);
      else if (/\.(ts|tsx|html|css|json)$/.test(entry.name)) {
        const text = await Deno.readTextFile(url);
        if (/service_role|SERVICE_ROLE|VITE_[A-Z_]*SERVICE/.test(text)) offenders.push(url.pathname);
      }
    }
  };
  await scan(new URL('src/', root));
  for (const f of ['index.html', 'role01-demo.html', 'devtools.html']) {
    const text = await Deno.readTextFile(new URL(f, root));
    if (/service_role|SERVICE_ROLE/.test(text)) offenders.push(f);
  }
  assertEquals(offenders, []);
});
