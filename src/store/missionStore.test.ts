import { describe, expect, it } from 'vitest';
import { MockMissionGateway, MockMissionHub } from '../core/MockMissionGateway';
import { createMissionStore } from './missionStore';

describe('mission store integration', () => {
  it('reflects a confirmed request in two independent client stores', async () => {
    const hub = new MockMissionHub();
    const ground = createMissionStore(new MockMissionGateway(hub));
    const satellite = createMissionStore(new MockMissionGateway(hub));
    await Promise.all([ground.getState().connect('room-1'), satellite.getState().connect('room-1')]);
    await ground.getState().sendAction({
      type: 'REQUEST_OBSERVATION', actionId: 'one', actorRole: 'ground',
      expectedRevision: 0, payload: { targetId: 'piura' },
    });
    expect(ground.getState().snapshot?.revision).toBe(1);
    expect(satellite.getState().snapshot?.revision).toBe(1);
    expect(satellite.getState().snapshot?.selectedTargetId).toBe('piura');
    expect(Object.isFrozen(satellite.getState().snapshot?.resources)).toBe(true);
    ground.getState().resetUi();
    satellite.getState().resetUi();
    expect(ground.getState().snapshot).toBeNull();
  });

  it('reports failures without changing authoritative resources', async () => {
    const store = createMissionStore(new MockMissionGateway(new MockMissionHub()));
    await store.getState().connect('room-1');
    await store.getState().sendAction({
      type: 'APPROVE_PLAN', actionId: 'bad-transition', actorRole: 'satellite',
      expectedRevision: 0, payload: { profileId: 'p1' },
    });
    expect(store.getState().error?.code).toBe('NOT_IMPLEMENTED');
    expect(store.getState().snapshot?.revision).toBe(0);
    expect(store.getState().snapshot?.resources.energyWh).toBe(0);
  });
});
