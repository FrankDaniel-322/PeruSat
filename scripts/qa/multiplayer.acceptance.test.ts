import { afterAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MissionAction, MissionSnapshot, PlayerRole } from '../../src/contracts/mission';
import { isMissionSnapshot } from '../../src/contracts/validation';
import type { MissionGateway, MissionGatewayEvent } from '../../src/core/MissionGateway';
import { DevMissionGateway } from '../../src/devtools/DevMissionGateway';
import { SupabaseMissionGateway } from '../../src/supabase/SupabaseMissionGateway';

declare const process: { env: Record<string, string | undefined> };

// Runs from the isolated worktree. No service_role key or token is logged.
const url = process.env.QA_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const publicKey = process.env.QA_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const remoteEnabled = process.env.QA_RUN_REMOTE === '1' && Boolean(url && publicKey);
const timeoutMs = Number(process.env.QA_TIMEOUT_MS ?? 15_000);
const clients: SupabaseClient[] = [];

function client(): SupabaseClient {
  if (!url || !publicKey) throw new Error('Faltan QA_SUPABASE_URL y QA_SUPABASE_ANON_KEY');
  const result = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  clients.push(result);
  return result;
}

async function signIn(c: SupabaseClient): Promise<string> {
  const { data, error } = await c.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`Autenticación anónima falló: ${error?.message ?? 'sin usuario'}`);
  return data.user.id;
}

const action = (
  role: PlayerRole,
  revision: number,
  type: MissionAction['type'],
  payload: MissionAction['payload'],
  actionId = crypto.randomUUID(),
): MissionAction => ({ actionId, actorRole: role, expectedRevision: revision, type, payload } as MissionAction);

async function rejected(operation: Promise<unknown>, label: string): Promise<void> {
  let accepted = false;
  try { await operation; accepted = true; } catch { /* Rechazo esperado. */ }
  expect(accepted, `${label} fue aceptada`).toBe(false);
}

function watch(gateway: MissionGateway, roomId: string) {
  const confirmed: MissionSnapshot[] = [];
  const connections: string[] = [];
  const unsubscribe = gateway.subscribe(roomId, (event: MissionGatewayEvent) => {
    if (event.kind === 'confirmed') confirmed.push(event.change.snapshot);
    else connections.push(event.state);
  });
  return { confirmed, connections, unsubscribe };
}

async function waitForRevision(watcher: ReturnType<typeof watch>, revision: number): Promise<MissionSnapshot> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const seen = watcher.confirmed.find((snapshot) => snapshot.revision === revision);
    if (seen) return seen;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Realtime no confirmó la revisión ${revision} en ${timeoutMs} ms`);
}

async function dispatchAndCompare(
  gateway: MissionGateway,
  peer: MissionGateway,
  peerWatch: ReturnType<typeof watch>,
  roomId: string,
  role: PlayerRole,
  type: MissionAction['type'],
  payload: MissionAction['payload'],
): Promise<MissionSnapshot> {
  const before = await gateway.getSnapshot(roomId);
  const change = await gateway.dispatch(roomId, action(role, before.revision, type, payload));
  expect(change.actionId).toBeTruthy();
  expect(change.eventId).toBeTruthy();
  expect(change.snapshot.revision).toBe(before.revision + 1);
  expect(isMissionSnapshot(change.snapshot)).toBe(true);
  const received = await waitForRevision(peerWatch, change.snapshot.revision);
  expect(received).toEqual(change.snapshot);
  expect(await peer.getSnapshot(roomId)).toEqual(change.snapshot);
  return change.snapshot;
}

async function a1(gatewayA: MissionGateway, gatewayB: MissionGateway, roomId: string,
  roleA: PlayerRole, watchA: ReturnType<typeof watch>, watchB: ReturnType<typeof watch>, verifyRoleDenials = false) {
  const ground = roleA === 'ground' ? gatewayA : gatewayB;
  const satellite = roleA === 'satellite' ? gatewayA : gatewayB;
  expect(roleA).toBe('ground');
  let snap = await ground.getSnapshot(roomId);
  const targets = ['piura-rio', 'piura-agricola'];
  for (const targetId of targets) {
    snap = await dispatchAndCompare(ground, satellite, watchB, roomId, 'ground', 'REQUEST_OBSERVATION', { targetId });
    snap = await dispatchAndCompare(satellite, ground, watchA, roomId, 'satellite', 'APPROVE_PLAN', { profileId: 'standard' });
    snap = await dispatchAndCompare(satellite, ground, watchA, roomId, 'satellite', 'CAPTURE_IMAGE', { targetId });
    const observation = snap.observations.at(-1);
    expect(observation?.quality).toBe('valid');
    expect(observation?.isSimulated).toBe(true);
    expect(observation?.sourceProvider).toBe('GAME_SIMULATION');
    snap = await dispatchAndCompare(ground, satellite, watchB, roomId, 'ground', 'REQUEST_TRANSMISSION', { observationId: observation!.observationId });
    snap = await dispatchAndCompare(satellite, ground, watchA, roomId, 'satellite', 'TRANSMIT_IMAGE', { observationId: observation!.observationId });
    if (verifyRoleDenials && targetId === targets[0]) {
      await rejected(satellite.dispatch(roomId, action('satellite', snap.revision, 'CLASSIFY_IMAGE', {
        observationId: observation!.observationId, finding: 'possible_flood',
      })), 'clasificación por Satellite sobre imagen recibida');
      expect((await ground.getSnapshot(roomId)).revision).toBe(snap.revision);
    }
    snap = await dispatchAndCompare(ground, satellite, watchB, roomId, 'ground', 'CLASSIFY_IMAGE', {
      observationId: observation!.observationId,
      finding: targetId === 'piura-rio' ? 'possible_flood' : 'normal',
    });
    if (verifyRoleDenials && targetId === targets[0]) {
      await rejected(satellite.dispatch(roomId, action('satellite', snap.revision, 'SUBMIT_REPORT', {
        reportId: `forged-${crypto.randomUUID()}`,
      })), 'informe por Satellite tras revisión');
      expect((await ground.getSnapshot(roomId)).revision).toBe(snap.revision);
    }
  }
  snap = await dispatchAndCompare(ground, satellite, watchB, roomId, 'ground', 'SUBMIT_REPORT', { reportId: `qa-${crypto.randomUUID()}` });
  expect(snap.status).toBe('won');
  expect(snap.phase).toBe('debrief');
  expect(snap.observations.filter((o) => o.transmitted && o.quality === 'valid')).toHaveLength(2);
  expect(await ground.getSnapshot(roomId)).toEqual(await satellite.getSnapshot(roomId));
  return snap;
}

describe('QA local: secuencia A1 con gateway de desarrollo', () => {
  it('dos suscriptores ven las 13 transiciones y el informe ganado', async () => {
    const gateway = new DevMissionGateway();
    const roomId = `qa-local-${crypto.randomUUID()}`;
    const watcherA = watch(gateway, roomId);
    const watcherB = watch(gateway, roomId);
    try {
      const result = await a1(gateway, gateway, roomId, 'ground', watcherA, watcherB);
      expect(result.revision).toBe(13);
      const revisions = Array.from({ length: 13 }, (_, i) => i + 1);
      expect(watcherA.confirmed.map((s) => s.revision)).toEqual(revisions);
      expect(watcherB.confirmed.map((s) => s.revision)).toEqual(revisions);
    } finally { watcherA.unsubscribe(); watcherB.unsubscribe(); }
  });
});

describe.skipIf(!remoteEnabled)('QA remoto: Supabase con identidades independientes', () => {
  it('A1 completo, Realtime, RLS, roles, idempotencia, concurrencia y reconexión', async () => {
    const a = client(), b = client(), outsider = client();
    const [idA, idB, idOut] = await Promise.all([signIn(a), signIn(b), signIn(outsider)]);
    expect(new Set([idA, idB, idOut]).size).toBe(3);
    const gwA = new SupabaseMissionGateway(a), gwB = new SupabaseMissionGateway(b);
    const created = await gwA.createRoom('A1', 'ground');
    expect(created.role).toBe('ground');
    expect(created.joinCode).toMatch(/^[A-Z0-9]{6}$/);
    const joined = await gwB.joinRoomByCode(created.joinCode);
    expect(joined.roomId).toBe(created.roomId);
    expect(joined.role).toBe('satellite');
    expect(await gwA.getRoomMembership(created.roomId)).toMatchObject({ role: 'ground' });
    expect(await gwB.getRoomMembership(created.roomId)).toMatchObject({ role: 'satellite' });

    const roomId = created.roomId;
    const { data: outsideRows, error: outsideError } = await outsider.from('mission_state').select('room_id').eq('room_id', roomId);
    expect(outsideError).toBeNull();
    expect(outsideRows).toEqual([]);
    const initial = await gwA.getSnapshot(roomId);
    expect(initial).toEqual(await gwB.getSnapshot(roomId));
    expect(initial.status).toBe('ready');
    const outsiderReset = await outsider.functions.invoke('dispatch_action', {
      body: { roomId, action: action('ground', 0, 'RESET_MISSION', { scenarioId: 'A1' }), expectedRevision: 0 },
    });
    expect(outsiderReset.data?.ok).not.toBe(true);
    expect((await gwA.getSnapshot(roomId)).revision).toBe(0);
    const watchA = watch(gwA, roomId), watchB = watch(gwB, roomId);
    try {
      const final = await a1(gwA, gwB, roomId, 'ground', watchA, watchB, true);
      expect(final.revision).toBe(13);
      expect(final).toEqual(await gwB.getSnapshot(roomId));

      // Try writing a forged snapshot directly with a public, authenticated client.
      const forged = { ...final, resources: { ...final.resources, energyWh: 999_999 } };
      const { data: changed, error: writeError } = await a.from('mission_state')
        .update({ snapshot: forged }).eq('room_id', roomId).select('room_id');
      expect(writeError === null ? changed : []).toEqual([]);
      expect((await gwB.getSnapshot(roomId)).resources.energyWh).toBe(final.resources.energyWh);

      watchB.unsubscribe();
      const nextWatch = watch(gwB, roomId);
      await waitForRevision(nextWatch, final.revision);
      expect(await gwB.getSnapshot(roomId)).toEqual(final);
      nextWatch.unsubscribe();
      expect(watchA.connections).toContain('connected');
    } finally { watchA.unsubscribe(); watchB.unsubscribe(); }
  }, 180_000);

  it('dos acciones de igual revisión no se confirman; reintento remoto conserva actionId', async () => {
    const a = client(), b = client();
    await Promise.all([signIn(a), signIn(b)]);
    const ga = new SupabaseMissionGateway(a), gb = new SupabaseMissionGateway(b);
    const roomId = (await ga.createRoom('A1', 'ground')).roomId;
    const membership = await gb.joinRoomByCode((await ga.getRoomMembership(roomId))!.joinCode);
    expect(membership.role).toBe('satellite');
    const s0 = await ga.getSnapshot(roomId);
    const s1 = (await ga.dispatch(roomId, action('ground', s0.revision, 'REQUEST_OBSERVATION', { targetId: 'piura-rio' }))).snapshot;
    await rejected(ga.dispatch(roomId, action('satellite', s1.revision, 'APPROVE_PLAN', { profileId: 'standard' })), 'suplantación Ground→Satellite con fase válida');
    expect((await gb.getSnapshot(roomId)).revision).toBe(s1.revision);
    const requestA = action('ground', s1.revision, 'REQUEST_OBSERVATION', { targetId: 'piura-urbano' });
    const requestB = action('satellite', s1.revision, 'APPROVE_PLAN', { profileId: 'standard' });
    const [raceA, raceB] = await Promise.all([
      a.functions.invoke('dispatch_action', { body: { roomId, action: requestA, expectedRevision: s1.revision } }),
      b.functions.invoke('dispatch_action', { body: { roomId, action: requestB, expectedRevision: s1.revision } }),
    ]);
    expect([raceA, raceB].filter((r) => r.data?.ok === true)).toHaveLength(1);
    const afterRace = await ga.getSnapshot(roomId);
    expect(afterRace.revision).toBe(s1.revision + 1);
    await gb.getSnapshot(roomId);
    const planned = afterRace.phase === 'capture'
      ? afterRace
      : (await gb.dispatch(roomId, action('satellite', afterRace.revision, 'APPROVE_PLAN', { profileId: 'standard' }))).snapshot;
    const capture = action('satellite', planned.revision, 'CAPTURE_IMAGE', { targetId: planned.selectedTargetId! });
    const original = await b.functions.invoke('dispatch_action', { body: { roomId, action: capture, expectedRevision: planned.revision } });
    expect(original.error).toBeNull();
    expect(original.data?.ok).toBe(true);
    const afterCapture = await ga.getSnapshot(roomId);
    const replay = await b.functions.invoke('dispatch_action', { body: { roomId, action: capture, expectedRevision: planned.revision } });
    expect(replay.error).toBeNull();
    expect(replay.data?.ok).toBe(true);
    expect(replay.data.change.actionId).toBe(capture.actionId);
    expect(replay.data.change.eventId).toBe(original.data.change.eventId);
    expect(await ga.getSnapshot(roomId)).toEqual(afterCapture);
  }, 60_000);
});

afterAll(async () => { await Promise.all(clients.map((c) => c.removeAllChannels())); });
