// Recorrido REAL con tres usuarios anónimos sobre un proyecto Supabase ya desplegado:
// A (ground) + B (satellite) juegan una A1 completa y C (ajeno) intenta entrar y leer.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=<clave publicable o anon> \
//     deno run --config supabase/deno.json --allow-net --allow-env supabase/tests/smoke.ts
//
// Solo usa la clave publicable (pública por diseño, la misma del navegador).
// NUNCA pongas aquí la service_role. No cubre Realtime (eso se comprueba con dos navegadores).

const BASE = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '');
const KEY = Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
if (!BASE || !KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY.');
  Deno.exit(2);
}

type Json = Record<string, any>;
interface User { id: string; token: string }

const results: { ok: boolean; name: string }[] = [];
function check(ok: boolean, name: string, detail?: unknown): void {
  results.push({ ok, name });
  console.log(`${ok ? '✔' : '✘'} ${name}${ok || detail === undefined ? '' : `  -> ${JSON.stringify(detail)}`}`);
}

async function call(path: string, token: string | null, init: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* respuesta no JSON */ }
  return { status: res.status, body };
}

async function signInAnonymously(): Promise<User> {
  const { status, body } = await call('/auth/v1/signup', null, { method: 'POST', body: JSON.stringify({ data: {} }) });
  if (status !== 200 || !body.access_token) {
    throw new Error(`No se pudo iniciar sesión anónima (HTTP ${status}). ¿Está activada la autenticación anónima? ${JSON.stringify(body)}`);
  }
  return { id: body.user.id, token: body.access_token };
}

const fn = (name: string, user: User | null, payload: unknown) =>
  call(`/functions/v1/${name}`, user?.token ?? null, { method: 'POST', body: JSON.stringify(payload) });

let counter = 0;
let revision = 0;
let roomId = '';

async function act(user: User, actorRole: 'ground' | 'satellite', type: string, payload: Json = {}, opts: { actionId?: string; expectedRevision?: number } = {}) {
  const action = {
    actionId: opts.actionId ?? `smoke-${Date.now()}-${++counter}`,
    actorRole,
    expectedRevision: opts.expectedRevision ?? revision,
    type,
    payload,
  };
  const res = await fn('dispatch_action', user, { roomId, action });
  if (res.status === 200 && !res.body.duplicate) revision = res.body.snapshot.revision;
  return { ...res, action };
}

const A = await signInAnonymously();
const B = await signInAnonymously();
const C = await signInAnonymously();

check((await fn('create_room', null, { scenarioId: 'A1' })).status === 401, 'crear sala sin sesión => 401');
const created = await fn('create_room', A, { scenarioId: 'A1', preferredRole: 'ground' });
check(created.status === 200 && created.body.revision === 0 && /^[A-Z0-9]{6}$/.test(created.body.joinCode), 'B01 crear sala (roomId, joinCode, rol, revisión 0)', created.body);
roomId = created.body.roomId;
const code: string = created.body.joinCode;

const rpc = (user: User, name: string, args: Json) => call(`/rest/v1/rpc/${name}`, user.token, { method: 'POST', body: JSON.stringify(args) });
const joinB = await rpc(B, 'join_room', { p_join_code: code });
check(joinB.body?.status === 'joined' && joinB.body?.role === 'satellite' && joinB.body?.roomId === roomId, 'B02 B se une y recibe el rol libre', joinB.body);
const joinC = await rpc(C, 'join_room', { p_join_code: code });
check(joinC.body?.status === 'room_full', 'B03 tercer usuario => room_full', joinC.body);

const readState = (user: User) => call(`/rest/v1/mission_state?room_id=eq.${roomId}&select=snapshot,revision`, user.token);
const outsider = await readState(C);
check(outsider.status === 200 && Array.isArray(outsider.body) && outsider.body.length === 0, 'B04 el ajeno no lee el estado (RLS)', outsider.body);
const asMember = await readState(A);
check(asMember.body?.[0]?.revision === 0, 'getSnapshot: el miembro lee el estado', asMember.body);
const outsiderWrite = await call(`/rest/v1/mission_state?room_id=eq.${roomId}`, C.token, { method: 'PATCH', body: JSON.stringify({ revision: 99 }) });
check(outsiderWrite.status >= 400, 'ningún cliente puede escribir en mission_state', outsiderWrite.status);
check((await act(C, 'ground', 'RESET_MISSION')).status === 403, 'el ajeno no puede inyectar acciones => 403');
check((await act(B, 'ground', 'REQUEST_OBSERVATION', { targetId: 'piura-rio' })).status === 403, 'B05b el rol del navegador no autoriza (B diciendo ser ground) => 403');
const wrong = await act(A, 'ground', 'CAPTURE_IMAGE', { targetId: 'piura-rio' });
check(wrong.status === 422 && wrong.body.denialCode === 'WRONG_ROLE', 'B05 ground intenta capturar => denegado', wrong.body);

async function cycle(target: string, obs: string) {
  const steps = [
    await act(A, 'ground', 'REQUEST_OBSERVATION', { targetId: target }),
    await act(B, 'satellite', 'APPROVE_PLAN', { profileId: 'standard' }),
    await act(B, 'satellite', 'CAPTURE_IMAGE', { targetId: target }),
    await act(A, 'ground', 'REQUEST_TRANSMISSION', { observationId: obs }),
    await act(B, 'satellite', 'TRANSMIT_IMAGE', { observationId: obs }),
    await act(A, 'ground', 'CLASSIFY_IMAGE', { observationId: obs, finding: 'possible_flood' }),
  ];
  return steps.every((s) => s.status === 200);
}
check(await cycle('piura-rio', 'obs-1'), 'observación 1 completa entre dos clientes');
check(await cycle('piura-urbano', 'obs-2'), 'observación 2 completa entre dos clientes');

const capture = await act(B, 'satellite', 'REQUEST_OBSERVATION', {}, {}); // acción inválida a propósito
check(capture.status === 400, 'acción mal formada => 400', capture.body);

const report = await act(A, 'ground', 'SUBMIT_REPORT', { reportId: `REP-SMOKE-${Date.now()}` });
check(report.status === 200 && report.body.snapshot?.status === 'won' && report.body.snapshot?.phase === 'debrief', 'B06 A1 completa => won / debrief', report.body);
const r = report.body.snapshot?.resources;
check(r && r.energyWh === 68 && r.storageMb === 42 && r.contactSeconds === 24 && r.budgetCredits === 80, 'recursos coherentes (68 Wh, 42 MB, 24 s, 80 créditos)', r);

const stored = await call(`/rest/v1/mission_reports?room_id=eq.${roomId}&select=finding,score,evidence`, A.token);
check(stored.body?.[0]?.score?.total === 100 && stored.body?.[0]?.finding === 'possible_flood', 'B13 informe y puntaje guardados por el servidor (100)', stored.body);
const outsiderReport = await call(`/rest/v1/mission_reports?room_id=eq.${roomId}&select=*`, C.token);
check(Array.isArray(outsiderReport.body) && outsiderReport.body.length === 0, 'el ajeno no lee el informe (RLS)', outsiderReport.body);

const before = (await readState(A)).body[0];
const replay = await fn('dispatch_action', A, { roomId, action: report.action });
check(replay.status === 200 && replay.body.duplicate === true, 'B08 reintento con el mismo actionId => duplicate, sin reaplicar', replay.body);
const clash = await act(A, 'ground', 'RESET_MISSION', {}, { actionId: report.action.actionId, expectedRevision: revision });
check(clash.status === 409 && clash.body.code === 'DUPLICATE_ACTION', 'B09 mismo actionId con otro contenido => 409', clash.body);
const stale = await act(A, 'ground', 'RESET_MISSION', {}, { expectedRevision: 0 });
check(stale.status === 409 && stale.body.code === 'REVISION_CONFLICT' && stale.body.snapshot, 'B10 revisión vieja => 409 con el snapshot vigente', stale.body);
const after = (await readState(A)).body[0];
check(after.revision === before.revision && JSON.stringify(after.snapshot) === JSON.stringify(before.snapshot), 'el estado no cambió con reintentos ni conflictos');

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones correctas`);
if (failed.length > 0) Deno.exit(1);
