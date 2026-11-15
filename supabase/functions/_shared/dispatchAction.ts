// dispatch_action: único camino por el que cambia el estado de una misión.
//
// Orden (cada paso corta con su propio error):
//  1. JWT de usuario válido  2. cuerpo y acción canónica  3. membresía real y actorRole coincidente
//  4. idempotencia por actionId  5. revisión esperada  6. motor applyAction (reglas únicas)
//  7. commit_mission_event (transacción SQL con bloqueo por sala)  8. respuesta

import {
  applyAction,
  computeScore,
  DENIAL_MESSAGES,
  isEvidence,
  type AppliedEvent,
  type DenialCode,
  type FloodSnapshot,
} from './engine.ts';
import { canonicalizeAction, canonicalJson } from './actions.ts';
import {
  authenticate,
  corsHeaders,
  errorResponse,
  type FunctionDeps,
  jsonResponse,
  readJsonBody,
  UUID_RE,
} from './http.ts';
import { type CommitResult, type ReportInput, StoreError, type StoredEvent } from './store.ts';
import type { MissionAction } from './engine.ts';

const denialMessage = (code: string | null | undefined): string =>
  (code && code in DENIAL_MESSAGES ? DENIAL_MESSAGES[code as DenialCode] : 'Acción denegada por las reglas de la misión.');

function buildReport(snapshot: FloodSnapshot, events: AppliedEvent[]): ReportInput {
  return {
    reportId: snapshot.reportId ?? '',
    finding: snapshot.reportFinding ?? 'insufficient',
    evidence: snapshot.observations.filter(isEvidence).map((o) => o.observationId),
    score: computeScore(snapshot, events),
  };
}

export async function handleDispatchAction(req: Request, deps: FunctionDeps): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req, deps.allowedOrigins) });
  }
  if (req.method !== 'POST') {
    return errorResponse(req, deps, 405, 'METHOD_NOT_ALLOWED', 'Usa POST.');
  }

  try {
    const { store } = deps;

    // 1) Usuario autenticado (JWT verificado con el servicio Auth, nunca solo decodificado).
    const user = await authenticate(req, store);
    if (!user) return errorResponse(req, deps, 401, 'NOT_AUTHENTICATED', 'Inicia sesión para jugar.');

    // 2) Cuerpo y acción canónica.
    const body = await readJsonBody(req);
    if (!body.ok) {
      return body.reason === 'too_large'
        ? errorResponse(req, deps, 413, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande.')
        : errorResponse(req, deps, 400, 'INVALID_ACTION', 'El cuerpo no es JSON válido.');
    }
    const raw = body.value;
    if (
      typeof raw !== 'object' || raw === null || Array.isArray(raw) ||
      Object.keys(raw).some((k) => k !== 'roomId' && k !== 'action')
    ) {
      return errorResponse(req, deps, 400, 'INVALID_ACTION', 'El cuerpo debe ser { roomId, action }.');
    }
    const { roomId: rawRoomId, action: rawAction } = raw as { roomId?: unknown; action?: unknown };
    if (typeof rawRoomId !== 'string' || !UUID_RE.test(rawRoomId)) {
      return errorResponse(req, deps, 400, 'INVALID_ACTION', 'roomId no es un UUID válido.');
    }
    const roomId = rawRoomId.toLowerCase();
    const action = canonicalizeAction(rawAction);
    if (!action) {
      return errorResponse(req, deps, 400, 'INVALID_ACTION', 'La acción no cumple el contrato canónico (schemaVersion 3).');
    }

    // 3) Autorización: el rol sale de room_members, nunca del navegador.
    //    Sala inexistente y "no soy miembro" dan la misma respuesta (no se puede sondear salas).
    const role = await store.getMembership(roomId, user.id);
    if (!role) return errorResponse(req, deps, 403, 'NOT_AUTHORIZED', 'No perteneces a esta sala.');
    if (action.actorRole !== role) {
      return errorResponse(req, deps, 403, 'NOT_AUTHORIZED', 'El rol de la acción no coincide con tu rol en la sala.');
    }

    // 4) Idempotencia (antes de la revisión: un reintento tras perder la respuesta debe
    //    recibir el resultado original, no un conflicto).
    const prior = await store.findEvent(roomId, action.actionId);
    if (prior) return await replay(req, deps, roomId, user.id, action, prior);

    // 5) Revisión esperada.
    const state = await store.getState(roomId);
    if (!state) return errorResponse(req, deps, 403, 'NOT_AUTHORIZED', 'No perteneces a esta sala.');
    if (action.expectedRevision !== state.revision) {
      return conflict(req, deps, state.revision, state.snapshot);
    }

    // 6) Reglas: la hora la pone el servidor.
    const applied = applyAction(state.snapshot, {
      eventId: action.actionId,
      expectedRevision: action.expectedRevision,
      actorRole: role,
      action,
      nowUtc: deps.now().toISOString(),
    });

    // 7) Confirmación transaccional.
    let report: ReportInput | null = null;
    if (applied.ok && action.type === 'SUBMIT_REPORT') {
      const history = await store.listEvents(roomId);
      report = buildReport(applied.snapshot, [...history, applied.event]);
    }
    const committed = await store.commit({
      roomId,
      eventId: action.actionId,
      actorId: user.id,
      actorRole: role,
      action,
      expectedRevision: action.expectedRevision,
      result: applied.ok ? 'accepted' : 'denied',
      reason: applied.ok ? null : applied.code,
      newSnapshot: applied.ok ? applied.snapshot : null,
      report,
    });

    // 8) Respuesta según lo que confirmó SQL (nunca un éxito que SQL no confirmó).
    return await respond(req, deps, roomId, user.id, action, committed, applied.ok ? applied.snapshot : state.snapshot, applied);
  } catch (err) {
    if (err instanceof StoreError && err.kind === 'rate_limited') {
      return errorResponse(req, deps, 429, 'RATE_LIMITED', 'Demasiados intentos. Espera un momento.');
    }
    console.error('dispatch_action error:', err instanceof Error ? err.message : String(err));
    return errorResponse(req, deps, 500, 'TRANSPORT_ERROR', 'No se pudo confirmar la acción. Reintenta con el mismo actionId.');
  }
}

type Applied = ReturnType<typeof applyAction>;

async function respond(
  req: Request,
  deps: FunctionDeps,
  roomId: string,
  userId: string,
  action: MissionAction,
  committed: CommitResult,
  snapshot: FloodSnapshot,
  applied: Applied,
): Promise<Response> {
  switch (committed.status) {
    case 'accepted':
      return jsonResponse(req, deps.allowedOrigins, 200, {
        eventId: action.actionId,
        actionId: action.actionId,
        snapshot,
      });
    case 'denied': {
      const code = applied.ok ? null : applied.code;
      return jsonResponse(req, deps.allowedOrigins, 422, {
        code: 'ACTION_DENIED',
        denialCode: code,
        message: applied.ok ? denialMessage(code) : applied.message,
        revision: committed.revision,
      });
    }
    case 'stale': {
      const fresh = await deps.store.getState(roomId);
      return conflict(req, deps, committed.revision ?? fresh?.revision ?? 0, fresh?.snapshot);
    }
    case 'duplicate': {
      // Otra petición con el mismo actionId se confirmó entre la comprobación y el commit.
      const prior = await deps.store.findEvent(roomId, action.actionId);
      if (prior) return await replay(req, deps, roomId, userId, action, prior);
      return errorResponse(req, deps, 500, 'TRANSPORT_ERROR', 'No se pudo confirmar la acción. Reintenta con el mismo actionId.');
    }
    case 'conflict_payload':
      return errorResponse(req, deps, 409, 'DUPLICATE_ACTION', 'Ese actionId ya se usó con otra acción.');
    case 'rate_limited':
      return errorResponse(req, deps, 429, 'RATE_LIMITED', 'Demasiados intentos denegados en esta sala.');
    case 'not_member':
    case 'no_room':
      return errorResponse(req, deps, 403, 'NOT_AUTHORIZED', 'No perteneces a esta sala.');
  }
}

/** Reintento de un actionId ya registrado: mismo contenido => mismo resultado; otro => conflicto. */
async function replay(
  req: Request,
  deps: FunctionDeps,
  roomId: string,
  userId: string,
  action: MissionAction,
  prior: StoredEvent,
): Promise<Response> {
  const sameContent = prior.actorId === userId && canonicalJson(prior.action) === canonicalJson(action);
  if (!sameContent) {
    return errorResponse(req, deps, 409, 'DUPLICATE_ACTION', 'Ese actionId ya se usó con otra acción.');
  }
  if (prior.result === 'denied') {
    return jsonResponse(req, deps.allowedOrigins, 422, {
      code: 'ACTION_DENIED',
      denialCode: prior.reason,
      message: denialMessage(prior.reason),
      revision: prior.revision,
      duplicate: true,
    });
  }
  const state = await deps.store.getState(roomId);
  if (!state) return errorResponse(req, deps, 403, 'NOT_AUTHORIZED', 'No perteneces a esta sala.');
  // El snapshot es el vigente (puede ser más nuevo que el de la acción original): el cliente
  // se queda con la revisión mayor. No se fabrica un snapshot histórico.
  return jsonResponse(req, deps.allowedOrigins, 200, {
    eventId: action.actionId,
    actionId: action.actionId,
    snapshot: state.snapshot,
    duplicate: true,
  });
}

function conflict(req: Request, deps: FunctionDeps, revision: number, snapshot?: FloodSnapshot): Response {
  return errorResponse(
    req,
    deps,
    409,
    'REVISION_CONFLICT',
    'El estado cambió mientras actuabas. Se te envía la revisión vigente.',
    { revision, ...(snapshot ? { snapshot } : {}) },
  );
}
