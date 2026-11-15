import { describe, expect, it } from 'vitest';
import { isMissionAction, isMissionSnapshot, isObservation } from './validation';

describe('schemaVersion 3 contracts', () => {
  it('accepts valid Mission A snapshots and rejects negative resources', () => {
    const snapshot = {
      schemaVersion: 3, roomId: 'room-1', missionId: 'flood-piura-01',
      phase: 'briefing', status: 'ready', revision: 0,
      resources: { energyWh: 0, storageMb: 0, contactSeconds: 0, budgetCredits: 0, massKg: 0 },
      observations: [],
    };
    expect(isMissionSnapshot(snapshot)).toBe(true);
    expect(isMissionSnapshot({ ...snapshot, status: 'running' })).toBe(true);
    expect(isMissionSnapshot({ ...snapshot, status: 'won' })).toBe(true);
    expect(isMissionSnapshot({ ...snapshot, status: 'lost' })).toBe(true);
    expect(isMissionSnapshot({ ...snapshot, status: 'active' })).toBe(false);
    expect(isMissionSnapshot({ ...snapshot, resources: { ...snapshot.resources, energyWh: -1 } })).toBe(false);
    expect(isMissionSnapshot({ ...snapshot, schemaVersion: 2 })).toBe(false);
  });

  it('checks UTC timestamps and source providers', () => {
    const observation = {
      observationId: 'obs-1', targetId: 'piura', quality: 'valid', sizeMb: 1,
      capturedAtUtc: '2026-11-14T20:00:00Z', isSimulated: true,
      sourceProvider: 'GAME_SIMULATION', transmitted: false,
    };
    expect(isObservation(observation)).toBe(true);
    expect(isObservation({ ...observation, capturedAtUtc: '2026-11-14T15:00:00-05:00' })).toBe(false);
    expect(isObservation({ ...observation, sourceProvider: 'UNKNOWN' })).toBe(false);
  });

  it('rejects malformed and unsupported actions', () => {
    const base = { actionId: 'action-1', actorRole: 'ground', expectedRevision: 0 };
    expect(isMissionAction({ ...base, type: 'REQUEST_OBSERVATION', payload: { targetId: 'piura' } })).toBe(true);
    expect(isMissionAction({ ...base, type: 'REQUEST_OBSERVATION', payload: {} })).toBe(false);
    expect(isMissionAction({ ...base, type: 'MISSION_B', payload: {} })).toBe(false);
  });
});
