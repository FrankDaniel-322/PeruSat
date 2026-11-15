import { describe, expect, it } from 'vitest';
import type { MissionAction } from '../../contracts/mission';
import { DevMissionGateway } from '../DevMissionGateway';

describe('DevMissionGateway - Integration & Verification Suite', () => {
  const roomId = 'test-room-piura';

  it('Escenario A1: Operación Rutinaria completa (Happy Path)', async () => {
    const gateway = new DevMissionGateway();
    let snap = await gateway.getSnapshot(roomId);

    expect(snap.phase).toBe('briefing');
    expect(snap.status).toBe('ready');
    expect(snap.revision).toBe(0);
    expect(snap.resources.energyWh).toBe(100);
    expect(snap.resources.storageMb).toBe(70);
    expect(snap.resources.contactSeconds).toBe(80);

    // 1. Base solicita observación
    const action1: MissionAction = {
      actionId: 'act-req-obs',
      actorRole: 'ground',
      expectedRevision: 0,
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'rio-piura' },
    };
    const res1 = await gateway.dispatch(roomId, action1);
    expect(res1.snapshot.phase).toBe('planning');
    expect(res1.snapshot.status).toBe('running');
    expect(res1.snapshot.selectedTargetId).toBe('rio-piura');
    expect(res1.snapshot.revision).toBe(1);

    // 2. Satélite aprueba plan
    const action2: MissionAction = {
      actionId: 'act-app-plan',
      actorRole: 'satellite',
      expectedRevision: 1,
      type: 'APPROVE_PLAN',
      payload: { profileId: 'optico-submetrico' },
    };
    const res2 = await gateway.dispatch(roomId, action2);
    expect(res2.snapshot.phase).toBe('capture');
    expect(res2.snapshot.selectedProfileId).toBe('optico-submetrico');
    expect(res2.snapshot.revision).toBe(2);

    // 3. Satélite captura imagen
    const action3: MissionAction = {
      actionId: 'act-cap-img',
      actorRole: 'satellite',
      expectedRevision: 2,
      type: 'CAPTURE_IMAGE',
      payload: { targetId: 'rio-piura' },
    };
    const res3 = await gateway.dispatch(roomId, action3);
    expect(res3.snapshot.phase).toBe('capture');
    expect(res3.snapshot.resources.energyWh).toBe(88); // 100 - 12
    expect(res3.snapshot.resources.storageMb).toBe(56); // 70 - 14
    expect(res3.snapshot.observations.length).toBe(1);
    expect(res3.snapshot.observations[0].quality).toBe('valid');
    expect(res3.snapshot.observations[0].transmitted).toBe(false);
    expect(res3.snapshot.revision).toBe(3);

    const obsId = res3.snapshot.observations[0].observationId;

    // 4. Base solicita transmisión
    const action4: MissionAction = {
      actionId: 'act-req-tx',
      actorRole: 'ground',
      expectedRevision: 3,
      type: 'REQUEST_TRANSMISSION',
      payload: { observationId: obsId },
    };
    const res4 = await gateway.dispatch(roomId, action4);
    expect(res4.snapshot.phase).toBe('downlink');
    expect(res4.snapshot.revision).toBe(4);

    // 5. Satélite transmite imagen
    const action5: MissionAction = {
      actionId: 'act-tx-img',
      actorRole: 'satellite',
      expectedRevision: 4,
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obsId },
    };
    const res5 = await gateway.dispatch(roomId, action5);
    expect(res5.snapshot.phase).toBe('review'); // Tras transmitir la imagen requerida, transiciona a review para clasificar
    expect(res5.snapshot.resources.energyWh).toBe(84); // 88 - 4
    expect(res5.snapshot.resources.contactSeconds).toBe(52); // 80 - 28
    expect(res5.snapshot.observations[0].transmitted).toBe(true);
    expect(res5.snapshot.revision).toBe(5);

    // 6. Base clasifica imagen
    const action6: MissionAction = {
      actionId: 'act-class-img',
      actorRole: 'ground',
      expectedRevision: 5,
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obsId, finding: 'possible_flood' },
    };
    const res6 = await gateway.dispatch(roomId, action6);
    expect(res6.snapshot.phase).toBe('review');
    expect(res6.snapshot.revision).toBe(6);

    // 7. Base solicita segunda observación (A1 requiere 2 evidencias útiles)
    const action7: MissionAction = {
      actionId: 'act-req-obs-2',
      actorRole: 'ground',
      expectedRevision: 6,
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'rio-chira' },
    };
    await gateway.dispatch(roomId, action7);

    // 8. Satélite aprueba plan
    const action8: MissionAction = {
      actionId: 'act-app-plan-2',
      actorRole: 'satellite',
      expectedRevision: 7,
      type: 'APPROVE_PLAN',
      payload: { profileId: 'standard' },
    };
    await gateway.dispatch(roomId, action8);

    // 9. Satélite captura segunda imagen
    const action9: MissionAction = {
      actionId: 'act-cap-img-2',
      actorRole: 'satellite',
      expectedRevision: 8,
      type: 'CAPTURE_IMAGE',
      payload: { targetId: 'rio-chira' },
    };
    const res9 = await gateway.dispatch(roomId, action9);
    const obsId2 = res9.snapshot.observations[1].observationId;

    // 10. Base solicita transmisión
    const action10: MissionAction = {
      actionId: 'act-req-tx-2',
      actorRole: 'ground',
      expectedRevision: 9,
      type: 'REQUEST_TRANSMISSION',
      payload: { observationId: obsId2 },
    };
    await gateway.dispatch(roomId, action10);

    // 11. Satélite transmite segunda imagen
    const action11: MissionAction = {
      actionId: 'act-tx-img-2',
      actorRole: 'satellite',
      expectedRevision: 10,
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obsId2 },
    };
    await gateway.dispatch(roomId, action11);

    // 12. Base clasifica segunda imagen
    const action12: MissionAction = {
      actionId: 'act-class-img-2',
      actorRole: 'ground',
      expectedRevision: 11,
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obsId2, finding: 'normal' },
    };
    await gateway.dispatch(roomId, action12);

    // 13. Base emite informe final
    const action13: MissionAction = {
      actionId: 'act-sub-rep',
      actorRole: 'ground',
      expectedRevision: 12,
      type: 'SUBMIT_REPORT',
      payload: { finding: 'possible_flood' },
    };
    const res13 = await gateway.dispatch(roomId, action13);
    expect(res13.snapshot.phase).toBe('debrief');
    expect(res13.snapshot.status).toBe('won');
    expect(res13.snapshot.revision).toBe(13);
  });

  it('Escenario A2: Incidente simulado de nubosidad y reporte prudente', async () => {
    const gateway = new DevMissionGateway();
    gateway.faultConfig.forcedQuality = 'cloudy';

    await gateway.dispatch(roomId, {
      actionId: 'a2-req',
      actorRole: 'ground',
      expectedRevision: 0,
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'rio-piura' },
    });

    await gateway.dispatch(roomId, {
      actionId: 'a2-app',
      actorRole: 'satellite',
      expectedRevision: 1,
      type: 'APPROVE_PLAN',
      payload: { profileId: 'optico-submetrico' },
    });

    const capRes = await gateway.dispatch(roomId, {
      actionId: 'a2-cap',
      actorRole: 'satellite',
      expectedRevision: 2,
      type: 'CAPTURE_IMAGE',
      payload: { targetId: 'rio-piura' },
    });

    const obs = capRes.snapshot.observations[0];
    expect(obs.quality).toBe('cloudy');

    await gateway.dispatch(roomId, {
      actionId: 'a2-tx',
      actorRole: 'satellite',
      expectedRevision: 3,
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obs.observationId },
    });

    // Base clasifica como 'insufficient' debido a nubosidad
    const classRes = await gateway.dispatch(roomId, {
      actionId: 'a2-class',
      actorRole: 'ground',
      expectedRevision: 4,
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obs.observationId, finding: 'insufficient' },
    });
    expect(classRes.snapshot.revision).toBe(5);

    // Base emite informe prudente
    const repRes = await gateway.dispatch(roomId, {
      actionId: 'a2-rep',
      actorRole: 'ground',
      expectedRevision: 5,
      type: 'SUBMIT_REPORT',
      payload: { finding: 'insufficient' },
    });
    expect(repRes.snapshot.phase).toBe('debrief');
    expect(repRes.snapshot.status).toBe('lost');
  });

  describe('Casos Borde e Invariantes del Sistema', () => {
    it('CB-01: Rechaza captura si la batería es insuficiente (< 12 Wh)', async () => {
      const gateway = new DevMissionGateway();
      gateway.injectResources(roomId, { energyWh: 8 });

      // Avanzar a fase de captura
      const s0 = await gateway.getSnapshot(roomId);
      await gateway.dispatch(roomId, {
        actionId: 'cb1-req',
        actorRole: 'ground',
        expectedRevision: s0.revision,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      });

      // APPROVE_PLAN fallará porque energyWh es 8 (< 12)
      const s1 = await gateway.getSnapshot(roomId);
      await expect(
        gateway.dispatch(roomId, {
          actionId: 'cb1-app',
          actorRole: 'satellite',
          expectedRevision: s1.revision,
          type: 'APPROVE_PLAN',
          payload: { profileId: 'optico' },
        })
      ).rejects.toThrow(/Energía insuficiente/);
    });

    it('CB-02: Rechaza captura si el almacenamiento es insuficiente (< 14 MB)', async () => {
      const gateway = new DevMissionGateway();

      await gateway.dispatch(roomId, {
        actionId: 'cb2-req',
        actorRole: 'ground',
        expectedRevision: 0,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      });

      await gateway.dispatch(roomId, {
        actionId: 'cb2-app',
        actorRole: 'satellite',
        expectedRevision: 1,
        type: 'APPROVE_PLAN',
        payload: { profileId: 'optico' },
      });

      // Forzar almacenamiento a 10 MB antes de capturar
      gateway.injectResources(roomId, { storageMb: 10 });
      const snap = await gateway.getSnapshot(roomId);

      await expect(
        gateway.dispatch(roomId, {
          actionId: 'cb2-cap',
          actorRole: 'satellite',
          expectedRevision: snap.revision,
          type: 'CAPTURE_IMAGE',
          payload: { targetId: 'rio-piura' },
        })
      ).rejects.toThrow(/Memoria interna insuficiente/);
    });

    it('CB-03: Rechaza transmisión si la ventana de contacto es insuficiente', async () => {
      const gateway = new DevMissionGateway();

      await gateway.dispatch(roomId, {
        actionId: 'cb3-req',
        actorRole: 'ground',
        expectedRevision: 0,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      });
      await gateway.dispatch(roomId, {
        actionId: 'cb3-app',
        actorRole: 'satellite',
        expectedRevision: 1,
        type: 'APPROVE_PLAN',
        payload: { profileId: 'optico' },
      });
      const cap = await gateway.dispatch(roomId, {
        actionId: 'cb3-cap',
        actorRole: 'satellite',
        expectedRevision: 2,
        type: 'CAPTURE_IMAGE',
        payload: { targetId: 'rio-piura' },
      });

      // Reducir contactSeconds a 10s (requiere 28s)
      gateway.injectResources(roomId, { contactSeconds: 10 });
      const snap = await gateway.getSnapshot(roomId);

      await expect(
        gateway.dispatch(roomId, {
          actionId: 'cb3-tx',
          actorRole: 'satellite',
          expectedRevision: snap.revision,
          type: 'TRANSMIT_IMAGE',
          payload: { observationId: cap.snapshot.observations[0].observationId },
        })
      ).rejects.toThrow(/ventana de comunicación física ha terminado/);
    });

    it('CB-04: Rechaza acción si el cliente está desconectado', async () => {
      const gateway = new DevMissionGateway();
      gateway.setConnectionState(roomId, 'disconnected');

      await expect(
        gateway.dispatch(roomId, {
          actionId: 'cb4-act',
          actorRole: 'ground',
          expectedRevision: 0,
          type: 'REQUEST_OBSERVATION',
          payload: { targetId: 'rio-piura' },
        })
      ).rejects.toThrow(/No hay conexión activa/);
    });

    it('CB-05: Garantiza idempotencia ante acción duplicada con el mismo actionId', async () => {
      const gateway = new DevMissionGateway();
      const action: MissionAction = {
        actionId: 'idempotent-act-01',
        actorRole: 'ground',
        expectedRevision: 0,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      };

      const firstCall = await gateway.dispatch(roomId, action);
      const secondCall = await gateway.dispatch(roomId, action);

      expect(firstCall.eventId).toBe(secondCall.eventId);
      expect(firstCall.snapshot.revision).toBe(1);
      expect(secondCall.snapshot.revision).toBe(1);
    });

    it('CB-06: Rechaza acción ejecutada por rol no autorizado', async () => {
      const gateway = new DevMissionGateway();

      // Satélite intentando REQUEST_OBSERVATION en briefing
      await expect(
        gateway.dispatch(roomId, {
          actionId: 'cb6-act1',
          actorRole: 'satellite',
          expectedRevision: 0,
          type: 'REQUEST_OBSERVATION',
          payload: { targetId: 'rio-piura' },
        })
      ).rejects.toThrow(/Solo la Base CNOIS/);

      // Base intentando APPROVE_PLAN
      await expect(
        gateway.dispatch(roomId, {
          actionId: 'cb6-act2',
          actorRole: 'ground',
          expectedRevision: 0,
          type: 'APPROVE_PLAN',
          payload: { profileId: 'optico' },
        })
      ).rejects.toThrow(/Solo el Satélite/);
    });

    it('CB-07: Rechaza acción con conflicto de revisión (expectedRevision desactualizado)', async () => {
      const gateway = new DevMissionGateway();

      // Primera acción exitosa (lleva a revision 1)
      await gateway.dispatch(roomId, {
        actionId: 'cb7-act1',
        actorRole: 'ground',
        expectedRevision: 0,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      });

      // Segunda acción con expectedRevision: 0 (desactualizado)
      await expect(
        gateway.dispatch(roomId, {
          actionId: 'cb7-act2',
          actorRole: 'satellite',
          expectedRevision: 0,
          type: 'APPROVE_PLAN',
          payload: { profileId: 'optico-submetrico' },
        })
      ).rejects.toThrow(/Conflicto de revisión/);
    });
  });
});
