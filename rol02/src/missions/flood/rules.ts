// Motor de reglas de la Misión A (flood-piura-01) · rol 02.
//
// Funciones PURAS: no usan red, reloj ni azar. Reciben el estado + una acción y devuelven
// el estado nuevo o una denegación explicada. La Edge Function las ejecuta para validar;
// el navegador NO es fuente de verdad (documento maestro, sección 13).

import type { Finding, MissionAction, MissionResources, PlayerRole, Quality } from '../../contracts/index.ts';
import type {
  ActionEnvelope,
  AppliedEvent,
  ApplyResult,
  DenialCode,
  FloodObservation,
  FloodSnapshot,
  ProfileId,
  ScenarioId,
  ScoreResult,
  TargetId,
} from './types.ts';
import {
  CAPTURE_ENERGY_WH,
  DENIAL_MESSAGES,
  LINK_MBPS,
  PROFILES,
  SCENARIOS,
  TARGETS,
  TRANSMIT_ENERGY_WH,
} from './config.ts';
import type { CaptureProfile } from './config.ts';

type Actor = PlayerRole | 'both';

const ACTION_ACTOR: Record<MissionAction['type'], Actor> = {
  REQUEST_OBSERVATION: 'ground',
  APPROVE_PLAN: 'satellite',
  CAPTURE_IMAGE: 'satellite',
  REQUEST_TRANSMISSION: 'ground',
  TRANSMIT_IMAGE: 'satellite',
  CLASSIFY_IMAGE: 'ground',
  SUBMIT_REPORT: 'ground',
  RESET_MISSION: 'both',
};

const FINDINGS: readonly Finding[] = ['normal', 'possible_flood', 'insufficient'];

const has = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

/** doc: el envío tarda ceil((sizeMb × 8) / 4) segundos con 4 Mb/s simulados. */
export function transmissionSeconds(sizeMb: number): number {
  return Math.ceil((sizeMb * 8) / LINK_MBPS);
}

export function createInitialSnapshot(roomId: string, scenarioId: ScenarioId, revision = 0): FloodSnapshot {
  return {
    schemaVersion: 3,
    roomId,
    missionId: 'flood-piura-01',
    phase: 'briefing',
    status: 'ready',
    revision,
    resources: { ...SCENARIOS[scenarioId].initialResources },
    observations: [],
    scenarioId,
    captureAttempts: {},
  };
}

function makeEvent(
  env: ActionEnvelope,
  revision: number,
  result: 'accepted' | 'denied',
  code?: DenialCode,
): AppliedEvent {
  const event: AppliedEvent = {
    eventId: env.eventId,
    revision,
    actorRole: env.actorRole,
    action: env.action,
    result,
    nowUtc: env.nowUtc,
  };
  if (code !== undefined) event.code = code;
  return event;
}

function missingForCapture(
  res: MissionResources,
  profile: CaptureProfile,
): { code: DenialCode; detail: string } | null {
  if (res.energyWh < CAPTURE_ENERGY_WH) {
    return { code: 'INSUFFICIENT_ENERGY', detail: `Necesita ${CAPTURE_ENERGY_WH} Wh y quedan ${res.energyWh} Wh.` };
  }
  if (res.storageMb < profile.sizeMb) {
    return { code: 'INSUFFICIENT_STORAGE', detail: `Necesita ${profile.sizeMb} MB y quedan ${res.storageMb} MB.` };
  }
  if (res.budgetCredits < profile.costCredits) {
    return {
      code: 'INSUFFICIENT_BUDGET',
      detail: `Cuesta ${profile.costCredits} créditos y quedan ${res.budgetCredits}.`,
    };
  }
  return null;
}

const isEvidence = (o: FloodObservation): boolean =>
  o.quality === 'valid' && (o.finding === 'normal' || o.finding === 'possible_flood');

/** Conclusión del informe: la más prudente que sostienen las imágenes válidas. */
function deriveReportFinding(observations: FloodObservation[]): Finding {
  const evidence = observations.filter(isEvidence);
  if (evidence.some((o) => o.finding === 'possible_flood')) return 'possible_flood';
  if (evidence.length > 0) return 'normal';
  return 'insufficient';
}

/**
 * Hay un plan en curso: zona pedida sin aprobar (planning) o plan aprobado sin capturar.
 * Pedir, transmitir o clasificar OTRA imagen no debe cambiar la fase en ese momento; si lo
 * hiciera, el plan quedaría inservible y el jugador sería penalizado sin culpa.
 */
function hasPendingPlan(s: FloodSnapshot): boolean {
  return s.phase === 'planning' || (s.phase === 'capture' && s.selectedProfileId !== undefined);
}

export function applyAction(snapshot: FloodSnapshot, env: ActionEnvelope): ApplyResult {
  const a = env.action;

  const fail = (code: DenialCode, detail?: string): ApplyResult => ({
    ok: false,
    code,
    message: detail ? `${DENIAL_MESSAGES[code]} ${detail}` : DENIAL_MESSAGES[code],
    event: makeEvent(env, snapshot.revision, 'denied', code),
  });

  if (env.expectedRevision !== snapshot.revision) {
    return fail('STALE_REVISION', `(revisión actual ${snapshot.revision}).`);
  }
  // La Edge Function debe validar la forma del JSON, pero el motor no se rompe si llega algo raro.
  if (typeof a !== 'object' || a === null || typeof a.type !== 'string' || !has(ACTION_ACTOR, a.type)) {
    return fail('UNKNOWN_ACTION');
  }

  const actor = ACTION_ACTOR[a.type];
  if (actor !== 'both' && actor !== env.actorRole) return fail('WRONG_ROLE');
  if (snapshot.phase === 'debrief' && a.type !== 'RESET_MISSION') return fail('MISSION_FINISHED');

  const next: FloodSnapshot = structuredClone(snapshot);
  const res = next.resources;

  switch (a.type) {
    case 'REQUEST_OBSERVATION': {
      if (!has(TARGETS, a.targetId)) return fail('UNKNOWN_TARGET');
      next.selectedTargetId = a.targetId;
      delete next.selectedProfileId;
      next.phase = 'planning';
      next.status = 'running';
      break;
    }

    case 'APPROVE_PLAN': {
      // El Satélite elige y aprueba el perfil. Si es inviable, se deniega con explicación.
      if (next.phase !== 'planning' || next.selectedTargetId === undefined) return fail('WRONG_PHASE');
      if (!has(PROFILES, a.profileId)) return fail('UNKNOWN_PROFILE');
      const profile = PROFILES[a.profileId as ProfileId];
      const lack = missingForCapture(res, profile);
      if (lack) return fail(lack.code, lack.detail);
      next.selectedProfileId = profile.profileId;
      next.phase = 'capture';
      break;
    }

    case 'CAPTURE_IMAGE': {
      if (next.phase !== 'capture' || next.selectedProfileId === undefined) return fail('PLAN_NOT_APPROVED');
      if (a.targetId !== next.selectedTargetId) return fail('TARGET_MISMATCH');
      const profile = PROFILES[next.selectedProfileId as ProfileId];
      const lack = missingForCapture(res, profile);
      if (lack) return fail(lack.code, lack.detail);

      const attempt = next.captureAttempts[a.targetId] ?? 0;
      const outcomes = SCENARIOS[next.scenarioId].captureOutcomes[a.targetId as TargetId];
      const quality: Quality = outcomes[Math.min(attempt, outcomes.length - 1)] ?? 'valid';

      res.energyWh -= CAPTURE_ENERGY_WH;
      res.storageMb -= profile.sizeMb;
      res.budgetCredits -= profile.costCredits;
      next.captureAttempts[a.targetId] = attempt + 1;
      next.observations.push({
        observationId: `obs-${next.observations.length + 1}`,
        targetId: a.targetId,
        quality,
        sizeMb: profile.sizeMb,
        capturedAtUtc: env.nowUtc,
        isSimulated: true,
        sourceProvider: 'GAME_SIMULATION',
        transmitted: false,
      });
      // Un plan = una captura. Otra toma requiere que la Base la pida y el Satélite la apruebe.
      delete next.selectedProfileId;
      break;
    }

    case 'REQUEST_TRANSMISSION': {
      const obs = next.observations.find((o) => o.observationId === a.observationId);
      if (!obs) return fail('UNKNOWN_OBSERVATION');
      if (obs.transmitted) return fail('ALREADY_TRANSMITTED');
      if (obs.requested) return fail('ALREADY_REQUESTED');
      obs.requested = true;
      if (!hasPendingPlan(next)) next.phase = 'downlink';
      break;
    }

    case 'TRANSMIT_IMAGE': {
      const obs = next.observations.find((o) => o.observationId === a.observationId);
      if (!obs) return fail('UNKNOWN_OBSERVATION');
      if (!obs.requested) return fail('NOT_REQUESTED');
      if (obs.transmitted) return fail('ALREADY_TRANSMITTED');
      const seconds = transmissionSeconds(obs.sizeMb);
      if (res.contactSeconds < seconds) {
        return fail('EXCEEDS_CONTACT_WINDOW', `Necesita ${seconds} s y quedan ${res.contactSeconds} s.`);
      }
      if (res.energyWh < TRANSMIT_ENERGY_WH) {
        return fail('INSUFFICIENT_ENERGY', `Necesita ${TRANSMIT_ENERGY_WH} Wh y quedan ${res.energyWh} Wh.`);
      }
      res.contactSeconds -= seconds;
      res.energyWh -= TRANSMIT_ENERGY_WH;
      // DECISIÓN 02: transmitir NO libera memoria (el contrato no tiene acción de borrar).
      obs.transmitted = true;
      if (!hasPendingPlan(next)) next.phase = 'downlink';
      break;
    }

    case 'CLASSIFY_IMAGE': {
      const obs = next.observations.find((o) => o.observationId === a.observationId);
      if (!obs) return fail('UNKNOWN_OBSERVATION');
      if (!obs.transmitted) return fail('NOT_TRANSMITTED');
      if (obs.finding !== undefined) return fail('ALREADY_CLASSIFIED');
      if (!FINDINGS.includes(a.finding)) return fail('UNKNOWN_FINDING');
      // Regla invariable: un archivo no válido nunca es evidencia confirmatoria.
      if (obs.quality !== 'valid' && a.finding !== 'insufficient') return fail('INVALID_EVIDENCE');
      obs.finding = a.finding;
      if (!hasPendingPlan(next)) next.phase = 'review';
      break;
    }

    case 'SUBMIT_REPORT': {
      if (next.status !== 'running') return fail('WRONG_PHASE');
      if (typeof a.reportId !== 'string' || a.reportId.trim() === '') return fail('INVALID_REPORT_ID');
      const scenario = SCENARIOS[next.scenarioId];
      const usefulEvidence = next.observations.filter(isEvidence).length;
      next.reportId = a.reportId;
      next.reportFinding = deriveReportFinding(next.observations);
      next.status = usefulEvidence >= scenario.requiredValidEvidence ? 'won' : 'lost';
      next.phase = 'debrief';
      break;
    }

    case 'RESET_MISSION': {
      const fresh = createInitialSnapshot(snapshot.roomId, snapshot.scenarioId, snapshot.revision + 1);
      return { ok: true, snapshot: fresh, event: makeEvent(env, fresh.revision, 'accepted') };
    }

    default: {
      const unreachable: never = a;
      void unreachable;
      return fail('UNKNOWN_ACTION');
    }
  }

  next.revision = snapshot.revision + 1;
  return { ok: true, snapshot: next, event: makeEvent(env, next.revision, 'accepted') };
}

// ---------------------------------------------------------------------------------------
// Puntaje didáctico (100 puntos). Se calcula SOLO desde el historial validado + el estado
// final, nunca desde la interfaz. No es la calificación del jurado.
// ---------------------------------------------------------------------------------------

const RESOURCE_DENIALS: ReadonlySet<DenialCode> = new Set<DenialCode>([
  'INSUFFICIENT_ENERGY',
  'INSUFFICIENT_STORAGE',
  'INSUFFICIENT_BUDGET',
  'EXCEEDS_CONTACT_WINDOW',
]);
const COORDINATION_DENIALS: ReadonlySet<DenialCode> = new Set<DenialCode>([
  'NOT_REQUESTED',
  'PLAN_NOT_APPROVED',
  'WRONG_PHASE',
  'TARGET_MISMATCH',
]);
const OVERCLAIM_DENIALS: ReadonlySet<DenialCode> = new Set<DenialCode>(['INVALID_EVIDENCE']);

/** Solo cuentan los eventos posteriores al último RESET_MISSION aceptado. */
export function eventsSinceLastReset(events: AppliedEvent[]): AppliedEvent[] {
  let start = 0;
  events.forEach((e, i) => {
    if (e.result === 'accepted' && e.action.type === 'RESET_MISSION') start = i + 1;
  });
  return events.slice(start);
}

export function computeScore(snapshot: FloodSnapshot, allEvents: AppliedEvent[]): ScoreResult {
  const events = eventsSinceLastReset(allEvents);
  const denied = events.filter((e) => e.result === 'denied');
  const countDenied = (codes: ReadonlySet<DenialCode>): number =>
    denied.filter((e) => e.code !== undefined && codes.has(e.code)).length;

  const scenario = SCENARIOS[snapshot.scenarioId];
  const obs = snapshot.observations;
  const evidence = obs.filter(isEvidence);
  const transmitted = obs.filter((o) => o.transmitted);
  const validTransmitted = transmitted.filter((o) => o.quality === 'valid');
  const validCaptures = obs.filter((o) => o.quality === 'valid');

  const overclaims = countDenied(OVERCLAIM_DENIALS);
  const resourceDenials = countDenied(RESOURCE_DENIALS);
  const coordinationDenials = countDenied(COORDINATION_DENIALS);
  const wrongFindings = obs.filter(
    (o) =>
      o.quality === 'valid' &&
      o.finding !== undefined &&
      o.finding !== TARGETS[o.targetId as TargetId]?.truth,
  ).length;

  const rigor = Math.max(
    0,
    Math.round(30 * Math.min(1, evidence.length / scenario.fullEvidence)) - 10 * overclaims - 8 * wrongFindings,
  );
  // Sin ninguna captura no hubo decisiones de ingeniería ni cooperación que evaluar:
  // quien envía el informe sin hacer nada no debe llevarse 45 puntos "de regalo".
  const played = obs.length > 0;
  const engineering = played ? Math.max(0, 25 - 5 * resourceDenials) : 0;
  const collaboration = played ? Math.max(0, 20 - 5 * coordinationDenials) : 0;
  const communication =
    transmitted.length === 0 ? 0 : Math.round((15 * validTransmitted.length) / transmitted.length);
  const efficiency = obs.length === 0 ? 0 : Math.round((10 * validCaptures.length) / obs.length);

  const notes: string[] = [];
  if (!played) {
    notes.push('No hiciste ninguna captura: sin observaciones no hay decisiones de ingeniería ni cooperación que evaluar.');
  }
  const wasted = transmitted.length - validTransmitted.length;
  if (wasted > 0) {
    notes.push(`Transmitiste ${wasted} archivo(s) sin valor: gastaste ventana de contacto sin ganar evidencia.`);
  }
  if (overclaims > 0) {
    notes.push('Intentaste concluir con una imagen no válida: con nubes o archivos dañados solo se puede reportar evidencia insuficiente.');
  }
  if (resourceDenials > 0) {
    notes.push(`${resourceDenials} acción(es) no cabían en energía, memoria, presupuesto o ventana de contacto.`);
  }
  if (wrongFindings > 0) {
    notes.push(`${wrongFindings} clasificación(es) no coincidieron con lo que mostraba la imagen demostrativa.`);
  }
  if (evidence.length < scenario.fullEvidence) {
    notes.push(
      `Evidencia útil: ${evidence.length} de ${scenario.fullEvidence}. Más evidencia válida, sin sobreafirmar, sube el puntaje.`,
    );
  }
  if (notes.length === 0) notes.push('Decisiones sin desperdicio: cada recurso gastado produjo evidencia útil.');

  return {
    total: Math.min(100, rigor + engineering + collaboration + communication + efficiency),
    breakdown: { rigor, engineering, collaboration, communication, efficiency },
    notes,
  };
}
