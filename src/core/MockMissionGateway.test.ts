import { describe, expect, it } from 'vitest';
import { MockMissionGateway, MockMissionHub } from './MockMissionGateway';

describe('MockMissionGateway', () => {
  it('publishes one confirmed revision to a second client and replays idempotently', async () => {
    const hub = new MockMissionHub();
    const ground = new MockMissionGateway(hub);
    const satellite = new MockMissionGateway(hub);
    const received: number[] = [];
    const unsubscribe = satellite.subscribe('room-1', (event) => {
      if (event.kind === 'confirmed') received.push(event.change.snapshot.revision);
    });
    const action = {
      type: 'REQUEST_OBSERVATION' as const, actionId: 'one', actorRole: 'ground' as const,
      expectedRevision: 0, payload: { targetId: 'piura' },
    };
    const first = await ground.dispatch('room-1', action);
    const replay = await ground.dispatch('room-1', action);
    expect(replay).toEqual(first);
    expect(received).toEqual([1]);
    expect((await satellite.getSnapshot('room-1')).selectedTargetId).toBe('piura');
    expect((await satellite.getSnapshot('room-1')).revision).toBe(1);
    unsubscribe();
  });

  it('rejects conflicting revisions, reused IDs, and unsupported transitions', async () => {
    const gateway = new MockMissionGateway(new MockMissionHub());
    const action = {
      type: 'REQUEST_OBSERVATION' as const, actionId: 'one', actorRole: 'ground' as const,
      expectedRevision: 0, payload: { targetId: 'piura' },
    };
    await gateway.dispatch('room-1', action);
    await expect(gateway.dispatch('room-1', { ...action, actionId: 'two' }))
      .rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await expect(gateway.dispatch('room-1', { ...action, payload: { targetId: 'tumbes' } }))
      .rejects.toMatchObject({ code: 'DUPLICATE_ACTION' });
    await expect(gateway.dispatch('room-1', {
      type: 'APPROVE_PLAN', actionId: 'three', actorRole: 'satellite',
      expectedRevision: 1, payload: { profileId: 'p1' },
    })).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    expect((await gateway.getSnapshot('room-1')).resources.energyWh).toBe(0);
  });

  it('rejects malformed actions at the runtime boundary', async () => {
    const gateway = new MockMissionGateway(new MockMissionHub());
    await expect(gateway.dispatch('room-1', {
      type: 'REQUEST_OBSERVATION', actionId: 'bad', actorRole: 'ground',
      expectedRevision: 0, payload: { targetId: '' },
    })).rejects.toMatchObject({ code: 'INVALID_ACTION' });
  });
});
