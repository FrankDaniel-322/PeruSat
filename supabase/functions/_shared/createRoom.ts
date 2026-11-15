// create_room: crea la sala cooperativa. El snapshot inicial lo genera el servidor.

import { createInitialSnapshot, type PlayerRole, type ScenarioId } from './engine.ts';
import {
  authenticate,
  corsHeaders,
  errorResponse,
  type FunctionDeps,
  jsonResponse,
  readJsonBody,
} from './http.ts';
import { StoreError } from './store.ts';

export async function handleCreateRoom(req: Request, deps: FunctionDeps): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req, deps.allowedOrigins) });
  }
  if (req.method !== 'POST') {
    return errorResponse(req, deps, 405, 'METHOD_NOT_ALLOWED', 'Usa POST.');
  }

  try {
    const user = await authenticate(req, deps.store);
    if (!user) return errorResponse(req, deps, 401, 'NOT_AUTHENTICATED', 'Inicia sesión para crear una sala.');

    const body = await readJsonBody(req);
    if (!body.ok) {
      return body.reason === 'too_large'
        ? errorResponse(req, deps, 413, 'PAYLOAD_TOO_LARGE', 'La solicitud es demasiado grande.')
        : errorResponse(req, deps, 400, 'INVALID_ACTION', 'El cuerpo no es JSON válido.');
    }
    const raw = body.value;
    if (
      typeof raw !== 'object' || raw === null || Array.isArray(raw) ||
      Object.keys(raw).some((k) => k !== 'scenarioId' && k !== 'preferredRole' && k !== 'ownerRole')
    ) {
      return errorResponse(req, deps, 400, 'INVALID_ACTION', 'El cuerpo debe ser { scenarioId, preferredRole? }.');
    }
    // `ownerRole` es el nombre que usa SupabaseMissionGateway (Rol 01); `preferredRole` el del documento
    // del Rol 02. Se aceptan ambos como el mismo campo; si vienen los dos deben coincidir.
    const { scenarioId, preferredRole, ownerRole } = raw as {
      scenarioId?: unknown; preferredRole?: unknown; ownerRole?: unknown;
    };
    if (scenarioId !== 'A1' && scenarioId !== 'A2') {
      return errorResponse(req, deps, 400, 'INVALID_ACTION', 'scenarioId debe ser "A1" o "A2".');
    }
    const wanted = [preferredRole, ownerRole];
    if (wanted.some((r) => r !== undefined && r !== 'ground' && r !== 'satellite')) {
      return errorResponse(req, deps, 400, 'INVALID_ACTION', 'El rol debe ser "ground" o "satellite".');
    }
    if (preferredRole !== undefined && ownerRole !== undefined && preferredRole !== ownerRole) {
      return errorResponse(req, deps, 400, 'INVALID_ACTION', 'preferredRole y ownerRole no coinciden.');
    }

    const roomId = deps.uuid();
    const role: PlayerRole = (preferredRole ?? ownerRole ?? 'ground') as PlayerRole;
    const created = await deps.store.createRoom({
      roomId,
      ownerId: user.id,
      role,
      scenarioId: scenarioId as ScenarioId,
      snapshot: createInitialSnapshot(roomId, scenarioId as ScenarioId),
    });

    return jsonResponse(req, deps.allowedOrigins, 200, {
      roomId: created.roomId,
      joinCode: created.joinCode,
      role: created.role,
      revision: 0,
    });
  } catch (err) {
    if (err instanceof StoreError && err.kind === 'rate_limited') {
      return errorResponse(req, deps, 429, 'RATE_LIMITED', 'Has creado demasiadas salas. Espera un momento.');
    }
    console.error('create_room error:', err instanceof Error ? err.message : String(err));
    return errorResponse(req, deps, 500, 'TRANSPORT_ERROR', 'No se pudo crear la sala. Intenta de nuevo.');
  }
}
