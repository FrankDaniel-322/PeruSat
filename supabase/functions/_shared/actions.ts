// Validación ESTRICTA de la acción que llega del navegador.
// Se reconstruye una acción canónica solo con campos conocidos (nada extra llega a la base de datos)
// y con límites de longitud/charset en todos los textos.

import type { MissionAction, PlayerRole } from './engine.ts';

const ID_RE = /^[A-Za-z0-9._:-]{1,100}$/;
const REPORT_ID_RE = /^[A-Za-z0-9._: -]{1,100}$/;
const FINDINGS = ['normal', 'possible_flood', 'insufficient'] as const;
const MAX_REVISION = 1_000_000;

type Rec = Record<string, unknown>;

const isPlain = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

const onlyKeys = (o: Rec, allowed: readonly string[]): boolean =>
  Object.keys(o).every((k) => allowed.includes(k));

const idOf = (v: unknown): v is string => typeof v === 'string' && ID_RE.test(v);
const findingOf = (v: unknown): v is (typeof FINDINGS)[number] =>
  typeof v === 'string' && (FINDINGS as readonly string[]).includes(v);

/** Devuelve la acción canónica o null si no cumple el contrato v3. */
export function canonicalizeAction(raw: unknown): MissionAction | null {
  if (!isPlain(raw) || !onlyKeys(raw, ['actionId', 'actorRole', 'expectedRevision', 'type', 'payload'])) {
    return null;
  }
  const { actionId, actorRole, expectedRevision, type, payload } = raw;
  if (!idOf(actionId)) return null;
  if (actorRole !== 'ground' && actorRole !== 'satellite') return null;
  if (
    typeof expectedRevision !== 'number' || !Number.isInteger(expectedRevision) ||
    expectedRevision < 0 || expectedRevision > MAX_REVISION
  ) return null;
  if (!isPlain(payload)) return null;

  // Tras la comprobación anterior solo puede ser 'ground' o 'satellite'; se fija el tipo explícitamente.
  const role: PlayerRole = actorRole === 'ground' ? 'ground' : 'satellite';
  const base = { actionId, actorRole: role, expectedRevision };

  switch (type) {
    case 'REQUEST_OBSERVATION':
    case 'CAPTURE_IMAGE':
      if (!onlyKeys(payload, ['targetId']) || !idOf(payload.targetId)) return null;
      return { ...base, type, payload: { targetId: payload.targetId } };

    case 'APPROVE_PLAN':
      if (!onlyKeys(payload, ['profileId']) || !idOf(payload.profileId)) return null;
      return { ...base, type, payload: { profileId: payload.profileId } };

    case 'REQUEST_TRANSMISSION':
    case 'TRANSMIT_IMAGE':
      if (!onlyKeys(payload, ['observationId']) || !idOf(payload.observationId)) return null;
      return { ...base, type, payload: { observationId: payload.observationId } };

    case 'CLASSIFY_IMAGE':
      if (!onlyKeys(payload, ['observationId', 'finding'])) return null;
      if (!idOf(payload.observationId) || !findingOf(payload.finding)) return null;
      return { ...base, type, payload: { observationId: payload.observationId, finding: payload.finding } };

    case 'SUBMIT_REPORT': {
      if (!onlyKeys(payload, ['finding', 'reportId'])) return null;
      const out: { finding?: (typeof FINDINGS)[number]; reportId?: string } = {};
      if (payload.finding !== undefined) {
        if (!findingOf(payload.finding)) return null;
        out.finding = payload.finding;
      }
      if (payload.reportId !== undefined) {
        if (typeof payload.reportId !== 'string' || !REPORT_ID_RE.test(payload.reportId)) return null;
        out.reportId = payload.reportId;
      }
      // Igual que contracts/validation.ts: al menos uno de los dos.
      if (out.finding === undefined && out.reportId === undefined) return null;
      return { ...base, type, payload: out };
    }

    case 'RESET_MISSION': {
      if (!onlyKeys(payload, ['scenarioId'])) return null;
      if (payload.scenarioId === undefined) return { ...base, type, payload: {} };
      if (payload.scenarioId !== 'A1' && payload.scenarioId !== 'A2') return null;
      return { ...base, type, payload: { scenarioId: payload.scenarioId } };
    }

    default:
      return null;
  }
}

/** JSON con claves ordenadas: sirve para comparar dos acciones sin depender del orden de campos. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const rec = value as Rec;
    return `{${Object.keys(rec).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(rec[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
