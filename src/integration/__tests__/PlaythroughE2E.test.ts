import { describe, expect, it } from 'vitest';
import type { MissionAction } from '../../contracts/mission';
import { DevMissionGateway } from '../../devtools/DevMissionGateway';

describe('Recorrido Completo de Juego (E2E Integration) · Misión A', () => {
  it('A1: Recorrido perfecto completo alcanza status "won" y 100 puntos didácticos', async () => {
    const gateway = new DevMissionGateway();
    const roomId = 'playthrough-a1';
    let snap = await gateway.getSnapshot(roomId);

    expect(snap.phase).toBe('briefing');
    expect(snap.status).toBe('ready');

    // Paso 1: Base solicita río Piura
    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-req1',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'piura-rio' },
    })).snapshot;
    expect(snap.phase).toBe('planning');
    expect(snap.status).toBe('running');

    // Paso 2: Satélite aprueba estándar (14 MB)
    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-app1',
      actorRole: 'satellite',
      expectedRevision: snap.revision,
      type: 'APPROVE_PLAN',
      payload: { profileId: 'standard' },
    })).snapshot;
    expect(snap.phase).toBe('capture');

    // Paso 3: Satélite captura
    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-cap1',
      actorRole: 'satellite',
      expectedRevision: snap.revision,
      type: 'CAPTURE_IMAGE',
      payload: { targetId: 'piura-rio' },
    })).snapshot;
    expect(snap.resources.energyWh).toBe(88); // 100 - 12
    expect(snap.resources.storageMb).toBe(56); // 70 - 14
    expect(snap.observations[0].quality).toBe('valid');

    const obs1 = snap.observations[0].observationId;

    // Paso 4: Base solicita enlace de telemetría
    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-reqtx1',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'REQUEST_TRANSMISSION',
      payload: { observationId: obs1 },
    })).snapshot;
    expect(snap.phase).toBe('downlink');

    // Paso 5: Satélite transmite por Banda X
    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-tx1',
      actorRole: 'satellite',
      expectedRevision: snap.revision,
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obs1 },
    })).snapshot;
    expect(snap.resources.energyWh).toBe(84); // 88 - 4
    expect(snap.resources.contactSeconds).toBe(52); // 80 - 28

    // Paso 6: Base clasifica como posible desborde
    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-cls1',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obs1, finding: 'possible_flood' },
    })).snapshot;
    expect(snap.phase).toBe('review');

    // Ciclo 2 para completar A1 (requiere 2 observaciones útiles)
    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-req2',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'piura-agricola' },
    })).snapshot;

    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-app2',
      actorRole: 'satellite',
      expectedRevision: snap.revision,
      type: 'APPROVE_PLAN',
      payload: { profileId: 'standard' },
    })).snapshot;

    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-cap2',
      actorRole: 'satellite',
      expectedRevision: snap.revision,
      type: 'CAPTURE_IMAGE',
      payload: { targetId: 'piura-agricola' },
    })).snapshot;

    const obs2 = snap.observations[1].observationId;

    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-reqtx2',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'REQUEST_TRANSMISSION',
      payload: { observationId: obs2 },
    })).snapshot;

    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-tx2',
      actorRole: 'satellite',
      expectedRevision: snap.revision,
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obs2 },
    })).snapshot;

    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-cls2',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obs2, finding: 'normal' },
    })).snapshot;

    // Paso final: Emisión de informe oficial
    snap = (await gateway.dispatch(roomId, {
      actionId: 'p1-rep',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'SUBMIT_REPORT',
      payload: { finding: 'possible_flood' },
    })).snapshot;

    expect(snap.phase).toBe('debrief');
    expect(snap.status).toBe('won');
    expect(snap.resources.energyWh).toBe(68);
    expect(snap.resources.storageMb).toBe(42);
    expect(snap.resources.contactSeconds).toBe(24);
    expect(snap.resources.budgetCredits).toBe(80);

    const score = gateway.getScore(roomId);
    expect(score.total).toBe(100);
    expect(score.breakdown.rigor).toBe(30);
    expect(score.breakdown.engineering).toBe(25);
    expect(score.breakdown.collaboration).toBe(20);
    expect(score.breakdown.communication).toBe(15);
    expect(score.breakdown.efficiency).toBe(10);
  });

  it('A2: Gestión de nubosidad, rechazo de sobreafirmación y victoria con reintento', async () => {
    const gateway = new DevMissionGateway();
    const roomId = 'playthrough-a2';
    gateway.setScenario(roomId, 'A2');
    let snap = await gateway.getSnapshot(roomId);

    // Toma 1 sobre el río (en A2 el 1.er intento sobre piura-rio es nublado)
    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-p1',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'piura-rio' },
    })).snapshot;

    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-p2',
      actorRole: 'satellite',
      expectedRevision: snap.revision,
      type: 'APPROVE_PLAN',
      payload: { profileId: 'standard' },
    })).snapshot;

    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-p3',
      actorRole: 'satellite',
      expectedRevision: snap.revision,
      type: 'CAPTURE_IMAGE',
      payload: { targetId: 'piura-rio' },
    })).snapshot;

    const obsCloudy = snap.observations[0];
    expect(obsCloudy.quality).toBe('cloudy');

    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-p4',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'REQUEST_TRANSMISSION',
      payload: { observationId: obsCloudy.observationId },
    })).snapshot;

    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-p5',
      actorRole: 'satellite',
      expectedRevision: snap.revision,
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obsCloudy.observationId },
    })).snapshot;

    // Intento de clasificar nublado como posible_flood -> DEBE SER RECHAZADO POR RIGOR
    const badClassify: MissionAction = {
      actionId: 'a2-bad-cls',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obsCloudy.observationId, finding: 'possible_flood' },
    };
    await expect(gateway.dispatch(roomId, badClassify)).rejects.toThrow(/solo puede clasificarse como evidencia insuficiente/);

    // Clasificación correcta prudente como insuficiente
    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-ok-cls',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obsCloudy.observationId, finding: 'insufficient' },
    })).snapshot;

    // Toma 2 sobre el río (en A2 el 2.º intento sobre piura-rio sale despejado)
    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-r2',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'piura-rio' },
    })).snapshot;

    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-r3',
      actorRole: 'satellite',
      expectedRevision: snap.revision,
      type: 'APPROVE_PLAN',
      payload: { profileId: 'standard' },
    })).snapshot;

    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-r4',
      actorRole: 'satellite',
      expectedRevision: snap.revision,
      type: 'CAPTURE_IMAGE',
      payload: { targetId: 'piura-rio' },
    })).snapshot;

    const obsClear = snap.observations[1];
    expect(obsClear.quality).toBe('valid');

    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-r5',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'REQUEST_TRANSMISSION',
      payload: { observationId: obsClear.observationId },
    })).snapshot;

    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-r6',
      actorRole: 'satellite',
      expectedRevision: snap.revision,
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obsClear.observationId },
    })).snapshot;

    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-r7',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obsClear.observationId, finding: 'possible_flood' },
    })).snapshot;

    // Emisión final del informe
    snap = (await gateway.dispatch(roomId, {
      actionId: 'a2-fin',
      actorRole: 'ground',
      expectedRevision: snap.revision,
      type: 'SUBMIT_REPORT',
      payload: { finding: 'possible_flood' },
    })).snapshot;

    expect(snap.phase).toBe('debrief');
    expect(snap.status).toBe('won'); // A2 exige >= 1 evidencia útil
    expect(snap.observations.length).toBe(2);

    const score = gateway.getScore(roomId);
    expect(score.total).toBeGreaterThan(0);
    // Hubo 1 intento de sobreafirmar que penalizó rigor en 10 puntos:
    expect(score.notes.some((n) => n.includes('Intentaste concluir con una imagen no válida'))).toBe(true);
  });
});
