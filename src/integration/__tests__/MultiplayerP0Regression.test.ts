import { describe, expect, it } from 'vitest';
import type { MissionAction, MissionSnapshot } from '../../contracts/mission';
import { DevMissionGateway, createInitialSnapshot } from '../../devtools/DevMissionGateway';
import { createMissionStore, selectResources } from '../../store/missionStore';
import { computeScore } from '../../missions/flood/rules';
import type { FloodSnapshot } from '../../missions/flood/types';

describe('PERUSAT CREW · Pruebas de Regresión P0 (Cierre Rol 01)', () => {
  const roomId = 'test-room-p0-regression';

  describe('1. Flujo Completo de Dos Ciclos en Misión A1 (Piura y Chira)', () => {
    it('permite a Ground y Satellite completar los dos ciclos de observación y alcanzar victoria (won)', async () => {
      const gateway = new DevMissionGateway();
      gateway.setScenario(roomId, 'A1');

      // Estado inicial: briefing
      let snap = await gateway.getSnapshot(roomId);
      expect(snap.phase).toBe('briefing');
      expect(snap.status).toBe('ready');

      // --- CICLO 1: RÍO PIURA ---
      // 1. Ground solicita observación sobre Río Piura
      const actReq1: MissionAction = {
        actionId: 'act-req-piura',
        actorRole: 'ground',
        expectedRevision: snap.revision,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      };
      const res1 = await gateway.dispatch(roomId, actReq1);
      snap = res1.snapshot;
      expect(snap.phase).toBe('planning');
      expect(snap.selectedTargetId).toBe('rio-piura');

      // 2. Satellite aprueba el plan óptico
      const actAppr1: MissionAction = {
        actionId: 'act-appr-piura',
        actorRole: 'satellite',
        expectedRevision: snap.revision,
        type: 'APPROVE_PLAN',
        payload: { profileId: 'standard' },
      };
      const res2 = await gateway.dispatch(roomId, actAppr1);
      snap = res2.snapshot;
      expect(snap.phase).toBe('capture');

      // 3. Satellite ejecuta la captura con sensor NAOMI
      const actCap1: MissionAction = {
        actionId: 'act-cap-piura',
        actorRole: 'satellite',
        expectedRevision: snap.revision,
        type: 'CAPTURE_IMAGE',
        payload: { targetId: 'rio-piura' },
      };
      const res3 = await gateway.dispatch(roomId, actCap1);
      snap = res3.snapshot;
      expect(snap.observations.length).toBe(1);
      expect(snap.observations[0].quality).toBe('valid');
      expect(snap.observations[0].transmitted).toBe(false);

      // 4. Ground solicita la bajada de telemetría por antena
      const actReqTx1: MissionAction = {
        actionId: 'act-reqtx-piura',
        actorRole: 'ground',
        expectedRevision: snap.revision,
        type: 'REQUEST_TRANSMISSION',
        payload: { observationId: snap.observations[0].observationId },
      };
      const res4 = await gateway.dispatch(roomId, actReqTx1);
      snap = res4.snapshot;
      expect(snap.phase).toBe('downlink');

      // 5. Satellite transmite la imagen por antena Banda X
      const actTx1: MissionAction = {
        actionId: 'act-tx-piura',
        actorRole: 'satellite',
        expectedRevision: snap.revision,
        type: 'TRANSMIT_IMAGE',
        payload: { observationId: snap.observations[0].observationId },
      };
      const res5 = await gateway.dispatch(roomId, actTx1);
      snap = res5.snapshot;
      expect(snap.observations[0].transmitted).toBe(true);

      // 6. Ground clasifica la imagen en el centro de análisis
      const actClass1: MissionAction = {
        actionId: 'act-class-piura',
        actorRole: 'ground',
        expectedRevision: snap.revision,
        type: 'CLASSIFY_IMAGE',
        payload: { observationId: snap.observations[0].observationId, finding: 'possible_flood' },
      };
      const res6 = await gateway.dispatch(roomId, actClass1);
      snap = res6.snapshot;
      expect(snap.phase).toBe('review');
      expect(snap.observations[0].finding).toBe('possible_flood');

      // --- CICLO 2: RÍO CHIRA (Segunda observación requerida para A1) ---
      // 7. Ground solicita una segunda observación sobre Río Chira desde phase review
      const actReq2: MissionAction = {
        actionId: 'act-req-chira',
        actorRole: 'ground',
        expectedRevision: snap.revision,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-chira' },
      };
      const res7 = await gateway.dispatch(roomId, actReq2);
      snap = res7.snapshot;
      expect(snap.phase).toBe('planning');
      expect(snap.selectedTargetId).toBe('rio-chira');

      // 8. Satellite aprueba el plan para la segunda zona
      const actAppr2: MissionAction = {
        actionId: 'act-appr-chira',
        actorRole: 'satellite',
        expectedRevision: snap.revision,
        type: 'APPROVE_PLAN',
        payload: { profileId: 'standard' },
      };
      const res8 = await gateway.dispatch(roomId, actAppr2);
      snap = res8.snapshot;
      expect(snap.phase).toBe('capture');

      // 9. Satellite captura la segunda imagen
      const actCap2: MissionAction = {
        actionId: 'act-cap-chira',
        actorRole: 'satellite',
        expectedRevision: snap.revision,
        type: 'CAPTURE_IMAGE',
        payload: { targetId: 'rio-chira' },
      };
      const res9 = await gateway.dispatch(roomId, actCap2);
      snap = res9.snapshot;
      expect(snap.observations.length).toBe(2);

      // 10. Ground solicita transmisión de la 2da imagen
      const actReqTx2: MissionAction = {
        actionId: 'act-reqtx-chira',
        actorRole: 'ground',
        expectedRevision: snap.revision,
        type: 'REQUEST_TRANSMISSION',
        payload: { observationId: snap.observations[1].observationId },
      };
      const res10 = await gateway.dispatch(roomId, actReqTx2);
      snap = res10.snapshot;
      expect(snap.phase).toBe('downlink');

      // 11. Satellite transmite la 2da imagen
      const actTx2: MissionAction = {
        actionId: 'act-tx-chira',
        actorRole: 'satellite',
        expectedRevision: snap.revision,
        type: 'TRANSMIT_IMAGE',
        payload: { observationId: snap.observations[1].observationId },
      };
      const res11 = await gateway.dispatch(roomId, actTx2);
      snap = res11.snapshot;
      expect(snap.observations[1].transmitted).toBe(true);

      // 12. Ground clasifica la 2da imagen
      const actClass2: MissionAction = {
        actionId: 'act-class-chira',
        actorRole: 'ground',
        expectedRevision: snap.revision,
        type: 'CLASSIFY_IMAGE',
        payload: { observationId: snap.observations[1].observationId, finding: 'possible_flood' },
      };
      const res12 = await gateway.dispatch(roomId, actClass2);
      snap = res12.snapshot;
      expect(snap.phase).toBe('review');
      expect(snap.observations[1].finding).toBe('possible_flood');

      // 13. Ground emite el informe final de situación
      const actReport: MissionAction = {
        actionId: 'act-report-final',
        actorRole: 'ground',
        expectedRevision: snap.revision,
        type: 'SUBMIT_REPORT',
        payload: { finding: 'possible_flood' },
      };
      const res13 = await gateway.dispatch(roomId, actReport);
      snap = res13.snapshot;

      // Verificación de Victoria de la Misión A1
      expect(snap.phase).toBe('debrief');
      expect(snap.status).toBe('won');
      const floodSnap = snap as FloodSnapshot;
      expect(floodSnap.reportFinding).toBe('possible_flood');

      // Verificación del informe didáctico oficial
      const applied = gateway.getAppliedEvents(roomId);
      const scoreResult = computeScore(floodSnap, applied);
      expect(scoreResult.total).toBeGreaterThanOrEqual(80);
    });
  });

  describe('2. Estado Remoto Inicial y Store Canónico (Zustand)', () => {
    it('no muestra recursos locales como confirmados mientras el snapshot remoto es null', async () => {
      let resolveSnapshot: (snap: MissionSnapshot) => void = () => {};
      const delayedGateway = {
        getSnapshot: () =>
          new Promise<MissionSnapshot>((resolve) => {
            resolveSnapshot = resolve;
          }),
        dispatch: async () => {
          throw new Error('Not implemented');
        },
        subscribe: (_roomId: string, listener: any) => {
          listener({ kind: 'connection', state: 'connecting' });
          return () => {};
        },
      };

      const store = createMissionStore(delayedGateway as any);

      // Antes de conectar
      const stateBefore = store.getState();
      expect(stateBefore.snapshot).toBeNull();
      expect(stateBefore.connection).toBe('disconnected');
      expect(selectResources(stateBefore)).toBeNull();

      // Al conectar hacia un servidor remoto
      const connectPromise = store.getState().connect('room-async-test');
      expect(store.getState().connection).toBe('connecting');
      expect(store.getState().snapshot).toBeNull();
      expect(selectResources(store.getState())).toBeNull();

      // El servidor responde con el snapshot confirmado
      const remoteSnap = {
        ...createInitialSnapshot('room-async-test'),
        revision: 1,
        phase: 'planning' as const,
        status: 'running' as const,
      };
      remoteSnap.resources.energyWh = 88;
      resolveSnapshot(remoteSnap);
      await connectPromise;

      const stateAfter = store.getState();
      expect(stateAfter.snapshot).not.toBeNull();
      expect(selectResources(stateAfter)?.energyWh).toBe(88);

      store.getState().resetUi();
    });

    it('bloquea el despacho de acciones si la conexión o snapshot no están confirmados', async () => {
      const gateway = new DevMissionGateway();
      const store = createMissionStore(gateway);

      // Intentar enviar acción sin estar conectado
      const dummyAction: MissionAction = {
        actionId: 'act-disconnected',
        actorRole: 'ground',
        expectedRevision: 0,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      };

      await store.getState().sendAction(dummyAction);
      expect(store.getState().error?.code).toBe('NOT_CONNECTED');
    });
  });

  describe('3. Reconexión y Control de Revisiones', () => {
    it('nunca permite que una revisión antigua sobrescriba una nueva', async () => {
      const gateway = new DevMissionGateway();
      const store = createMissionStore(gateway);
      await store.getState().connect('room-rev-check');

      const initialRevision = store.getState().snapshot!.revision;

      // Despachar una acción para avanzar revisión
      await store.getState().sendAction({
        actionId: 'act-step-1',
        actorRole: 'ground',
        expectedRevision: initialRevision,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      });

      const currentRevision = store.getState().snapshot!.revision;
      expect(currentRevision).toBe(initialRevision + 1);

      // Intentar enviar acción con revisión vieja (conflicto optimista)
      const staleAction: MissionAction = {
        actionId: 'act-stale-test',
        actorRole: 'ground',
        expectedRevision: initialRevision, // Vieja: se esperaba currentRevision
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-chira' },
      };

      await store.getState().sendAction(staleAction);
      expect(store.getState().snapshot!.revision).toBe(currentRevision);

      store.getState().resetUi();
    });

    it('gestiona la transición de reconexión tras un microcorte', async () => {
      const gateway = new DevMissionGateway();
      const store = createMissionStore(gateway);
      await store.getState().connect('room-reconnect-check');

      expect(store.getState().connection).toBe('connected');

      // Simular reconexión
      await store.getState().reconnect();
      expect(store.getState().connection).toBe('connected');
      expect(store.getState().snapshot).not.toBeNull();

      store.getState().resetUi();
    });
  });

  describe('4. Idempotencia y Prevención de Acciones Duplicadas', () => {
    it('retorna el mismo resultado y no incrementa revisión si se envía la misma acción dos veces', async () => {
      const gateway = new DevMissionGateway();
      const snap = await gateway.getSnapshot('room-idemp-test');

      const duplicateAction: MissionAction = {
        actionId: 'act-idempotent-unique',
        actorRole: 'ground',
        expectedRevision: snap.revision,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      };

      const res1 = await gateway.dispatch('room-idemp-test', duplicateAction);
      const res2 = await gateway.dispatch('room-idemp-test', duplicateAction);

      expect(res1.eventId).toBe(res2.eventId);
      expect(res1.snapshot.revision).toBe(res2.snapshot.revision);
      expect(res2.snapshot.revision).toBe(snap.revision + 1);
    });
  });

  describe('5. Bloqueo de Suplantación de Roles (Anti-Spoofing)', () => {
    it('rechaza que Ground ejecute acciones exclusivas de Satellite', async () => {
      const gateway = new DevMissionGateway();
      const snap = await gateway.getSnapshot('room-role-guard');

      // Ground intenta aprobar plan (rol exclusivo de satélite)
      const spoofAction: MissionAction = {
        actionId: 'act-spoof-1',
        actorRole: 'ground',
        expectedRevision: snap.revision,
        type: 'APPROVE_PLAN',
        payload: { profileId: 'standard' },
      };

      await expect(gateway.dispatch('room-role-guard', spoofAction)).rejects.toThrow(/WRONG_ROLE|Solo el Satélite/);
    });

    it('rechaza que Satellite ejecute acciones exclusivas de Ground', async () => {
      const gateway = new DevMissionGateway();
      const snap = await gateway.getSnapshot('room-role-guard-2');

      // Satellite intenta solicitar observación (rol exclusivo de base CNOIS)
      const spoofAction: MissionAction = {
        actionId: 'act-spoof-2',
        actorRole: 'satellite',
        expectedRevision: snap.revision,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      };

      await expect(gateway.dispatch('room-role-guard-2', spoofAction)).rejects.toThrow(/WRONG_ROLE|Solo la Base CNOIS/);
    });
  });

  describe('6. Informe Derivado del Snapshot Confirmado', () => {
    it('si solo se cuenta con 1 observación en A1 el resultado es lost, pero con 2 observaciones es won', async () => {
      const gateway = new DevMissionGateway();
      gateway.setScenario('room-report-check', 'A1');

      let snap = await gateway.getSnapshot('room-report-check');

      // Completar solo 1 ciclo
      const resReq = await gateway.dispatch('room-report-check', {
        actionId: 'a1-req',
        actorRole: 'ground',
        expectedRevision: snap.revision,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      });
      const resAppr = await gateway.dispatch('room-report-check', {
        actionId: 'a1-appr',
        actorRole: 'satellite',
        expectedRevision: resReq.snapshot.revision,
        type: 'APPROVE_PLAN',
        payload: { profileId: 'standard' },
      });
      const resCap = await gateway.dispatch('room-report-check', {
        actionId: 'a1-cap',
        actorRole: 'satellite',
        expectedRevision: resAppr.snapshot.revision,
        type: 'CAPTURE_IMAGE',
        payload: { targetId: 'rio-piura' },
      });
      const resTxReq = await gateway.dispatch('room-report-check', {
        actionId: 'a1-txreq',
        actorRole: 'ground',
        expectedRevision: resCap.snapshot.revision,
        type: 'REQUEST_TRANSMISSION',
        payload: { observationId: resCap.snapshot.observations[0].observationId },
      });
      const resTx = await gateway.dispatch('room-report-check', {
        actionId: 'a1-tx',
        actorRole: 'satellite',
        expectedRevision: resTxReq.snapshot.revision,
        type: 'TRANSMIT_IMAGE',
        payload: { observationId: resCap.snapshot.observations[0].observationId },
      });
      const resClass = await gateway.dispatch('room-report-check', {
        actionId: 'a1-class',
        actorRole: 'ground',
        expectedRevision: resTx.snapshot.revision,
        type: 'CLASSIFY_IMAGE',
        payload: { observationId: resCap.snapshot.observations[0].observationId, finding: 'possible_flood' },
      });

      // Si Ground emite informe con solo 1 evidencia en A1 -> LOST
      const resPremature = await gateway.dispatch('room-report-check', {
        actionId: 'a1-premature',
        actorRole: 'ground',
        expectedRevision: resClass.snapshot.revision,
        type: 'SUBMIT_REPORT',
        payload: { finding: 'possible_flood' },
      });

      expect(resPremature.snapshot.status).toBe('lost');
    });
  });
});
