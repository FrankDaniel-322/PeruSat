import type { MissionAction, MissionSnapshot, Observation } from './mission';

const phases = ['briefing', 'planning', 'capture', 'downlink', 'review', 'debrief'];
const qualities = ['valid', 'cloudy', 'corrupt', 'incomplete'];
const findings = ['normal', 'possible_flood', 'insufficient'];
const providers = ['NASA', 'CONIDA', 'GAME_SIMULATION'];
const statuses = ['active', 'completed', 'failed'];

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const nonnegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => nonnegative(value) && Number.isInteger(value);
const oneOf = (value: unknown, values: readonly string[]): value is string =>
  typeof value === 'string' && values.includes(value);
const utcIso = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
  && !Number.isNaN(Date.parse(value));

export function isObservation(value: unknown): value is Observation {
  if (!object(value)) return false;
  return text(value.observationId) && text(value.targetId)
    && oneOf(value.quality, qualities) && nonnegative(value.sizeMb)
    && utcIso(value.capturedAtUtc) && typeof value.isSimulated === 'boolean'
    && oneOf(value.sourceProvider, providers)
    && (value.sourceUrl === undefined || text(value.sourceUrl))
    && typeof value.transmitted === 'boolean';
}

export function isMissionSnapshot(value: unknown): value is MissionSnapshot {
  if (!object(value) || !object(value.resources)) return false;
  return value.schemaVersion === 3 && text(value.roomId)
    && value.missionId === 'flood-piura-01' && oneOf(value.phase, phases)
    && oneOf(value.status, statuses) && integer(value.revision)
    && nonnegative(value.resources.energyWh)
    && nonnegative(value.resources.storageMb)
    && nonnegative(value.resources.contactSeconds)
    && nonnegative(value.resources.budgetCredits)
    && nonnegative(value.resources.massKg)
    && Array.isArray(value.observations) && value.observations.every(isObservation)
    && (value.selectedTargetId === undefined || text(value.selectedTargetId))
    && (value.selectedProfileId === undefined || text(value.selectedProfileId));
}

export function isMissionAction(value: unknown): value is MissionAction {
  if (!object(value) || !object(value.payload)) return false;
  if (!text(value.actionId) || !oneOf(value.actorRole, ['ground', 'satellite'])
    || !integer(value.expectedRevision)) return false;
  switch (value.type) {
    case 'REQUEST_OBSERVATION': return text(value.payload.targetId);
    case 'APPROVE_PLAN': return text(value.payload.profileId);
    case 'CAPTURE_IMAGE': return text(value.payload.targetId);
    case 'REQUEST_TRANSMISSION':
    case 'TRANSMIT_IMAGE': return text(value.payload.observationId);
    case 'CLASSIFY_IMAGE': return text(value.payload.observationId)
      && oneOf(value.payload.finding, findings);
    case 'SUBMIT_REPORT': return oneOf(value.payload.finding, findings);
    case 'RESET_MISSION': return Object.keys(value.payload).length === 0;
    default: return false;
  }
}
