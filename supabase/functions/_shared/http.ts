// Utilidades HTTP comunes: CORS con lista de orígenes y respuestas JSON con errores estables.

import type { Store } from './store.ts';

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
];

/** ALLOWED_ORIGINS = lista separada por comas (secreto/variable de la función). */
export function parseAllowedOrigins(raw: string | undefined | null): string[] {
  const list = (raw ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter((s) => s.length > 0);
  return list.length > 0 ? list : DEFAULT_ALLOWED_ORIGINS;
}

export interface FunctionDeps {
  store: Store;
  now: () => Date;
  allowedOrigins: string[];
  uuid: () => string;
}

export function corsHeaders(req: Request, allowedOrigins: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
  };
  const origin = req.headers.get('origin');
  if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function jsonResponse(
  req: Request,
  allowedOrigins: string[],
  status: number,
  body: unknown,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req, allowedOrigins),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Códigos de error de protocolo (HTTP 4xx/5xx). Los resultados de juego (acción denegada, revisión
 * vieja, actionId repetido) NO son errores HTTP: ver ROLE02_BACKEND_API.md, sección «Formato».
 */
export type ApiErrorCode =
  | 'INVALID_ACTION'
  | 'NOT_AUTHENTICATED'
  | 'NOT_AUTHORIZED'
  | 'RATE_LIMITED'
  | 'METHOD_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'
  | 'TRANSPORT_ERROR';

export function errorResponse(
  req: Request,
  deps: Pick<FunctionDeps, 'allowedOrigins'>,
  status: number,
  code: ApiErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  return jsonResponse(req, deps.allowedOrigins, status, { ok: false, code, message, ...extra });
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_BODY_CHARS = 4096;

/** Autenticación común: exige `Authorization: Bearer <JWT de usuario>`. */
export async function authenticate(req: Request, store: Store): Promise<{ id: string } | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!match) return null;
  return await store.getUserFromToken(match[1]);
}

/** Lee el cuerpo JSON con tope de tamaño. Devuelve un código de error o el valor. */
export async function readJsonBody(
  req: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; reason: 'too_large' | 'invalid_json' }> {
  const text = await req.text();
  if (text.length > MAX_BODY_CHARS) return { ok: false, reason: 'too_large' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }
}
