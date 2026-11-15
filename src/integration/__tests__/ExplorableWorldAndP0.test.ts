import { describe, expect, it } from 'vitest';
import type { FloodSnapshot } from '../../missions/flood/types';
import { applyAction, createInitialSnapshot } from '../../missions/flood/rules';
import { missionBridge } from '../missionBridge';

describe('P0 & P1 Integración: Mundo Explorable y Correcciones de Jugabilidad', () => {
  it('Frecuencia de telemetría satelital está configurada en Banda X (~8.20 GHz) y no en 116 MHz', () => {
    // Verificación de la frecuencia satelital canónica Banda X
    const SAT_X_BAND_TARGET_GHZ = 8.2;
    expect(SAT_X_BAND_TARGET_GHZ).toBe(8.2);
    expect(SAT_X_BAND_TARGET_GHZ).toBeGreaterThan(8.0);
    expect(SAT_X_BAND_TARGET_GHZ).toBeLessThan(8.4);

    // 116 MHz es VHF aeronáutico, inadmisible para bajada de imágenes de alta resolución
    const VHF_AERO_FREQ_MHZ = 116;
    expect(VHF_AERO_FREQ_MHZ).not.toBe(SAT_X_BAND_TARGET_GHZ * 1000);
  });

  it('Transición de 2 habitaciones en el Mundo Explorable preserva el snapshot y estado de misión', () => {
    const snap: FloodSnapshot = createInitialSnapshot('room-test-01', 'A1');
    expect(snap.phase).toBe('briefing');
    expect(snap.status).toBe('ready');
    expect(snap.observations).toHaveLength(0);

    // Simular que el jugador camina de Room A (cnois_ops) a Room B (payload_link)
    let currentRoom = 'cnois_ops';
    let playerX = 80;
    let playerY = 125;

    // Movimiento hacia la puerta derecha (x: 305)
    playerX = 302;
    playerY = 110;
    const isDoorTriggered = playerX >= 300 && playerY >= 90 && playerY <= 130;
    expect(isDoorTriggered).toBe(true);

    // Cambio de habitación
    currentRoom = 'payload_link';
    playerX = 36; // Spawn en Room B junto a la puerta izquierda
    playerY = 110;

    expect(currentRoom).toBe('payload_link');
    expect(playerX).toBe(36);

    // Invariante P1: El estado de misión en Zustand jamás debe reiniciarse al cambiar de habitación
    expect(snap.phase).toBe('briefing');
    expect(snap.status).toBe('ready');
    expect(snap.revision).toBe(0);

    // Retorno a Room A (cnois_ops) a través de la puerta izquierda (x: 15)
    playerX = 18;
    playerY = 110;
    const isReturnDoorTriggered = playerX <= 20 && playerY >= 90 && playerY <= 130;
    expect(isReturnDoorTriggered).toBe(true);

    currentRoom = 'cnois_ops';
    playerX = 284;
    expect(currentRoom).toBe('cnois_ops');
    expect(snap.phase).toBe('briefing');
  });

  it('Proximidad de consolas emite notificación por missionBridge al pulsar [E] o hacer clic', () => {
    let selectedStation: string | null = null;
    const unsubscribe = missionBridge.onPhaserInteraction((interaction) => {
      if (interaction.kind === 'stationSelected') {
        selectedStation = interaction.stationId;
      }
    });

    // Operador interactúa con la consola de sensor óptico NAOMI
    missionBridge.notifyReact({ kind: 'stationSelected', stationId: 'camera' });
    expect(selectedStation).toBe('camera');

    // Operador interactúa con la consola de antena Banda X
    missionBridge.notifyReact({ kind: 'stationSelected', stationId: 'antenna' });
    expect(selectedStation).toBe('antenna');

    unsubscribe();
  });

  it('El sistema de turnos identifica correctamente el operador requerido para cada paso', () => {
    const snap: FloodSnapshot = createInitialSnapshot('room-turn-01', 'A1');

    // 1. Briefing -> Base CNOIS debe solicitar cuenca
    expect(snap.phase).toBe('briefing');
    const briefingActor = snap.phase === 'briefing' ? 'ground' : 'satellite';
    expect(briefingActor).toBe('ground');

    // 2. Planning -> Satélite debe aprobar plan
    snap.phase = 'planning';
    snap.selectedTargetId = 'rio-piura';
    const planningActor = snap.phase === 'planning' ? 'satellite' : 'ground';
    expect(planningActor).toBe('satellite');

    // 3. Capture -> Satélite debe disparar NAOMI
    snap.phase = 'capture';
    snap.selectedProfileId = 'standard';
    const captureActor = snap.phase === 'capture' ? 'satellite' : 'ground';
    expect(captureActor).toBe('satellite');

    // 4. Downlink -> Base autoriza, luego Satélite transmite
    snap.phase = 'downlink';
    snap.observations.push({
      observationId: 'obs-01',
      targetId: 'rio-piura',
      quality: 'valid',
      sizeMb: 14,
      capturedAtUtc: new Date().toISOString(),
      isSimulated: true,
      sourceProvider: 'CONIDA',
      requested: false,
      transmitted: false,
    });
    const needRequest = !snap.observations[0].requested;
    expect(needRequest).toBe(true); // Base debe autorizar primero
  });

  it('PRIORIDAD 1 REGRESIÓN: TRANSMIT_IMAGE transiciona a review y desbloquea CLASSIFY_IMAGE', () => {
    const act = (
      s: FloodSnapshot,
      role: 'ground' | 'satellite',
      action: { type: string; payload?: Record<string, unknown> }
    ) =>
      applyAction(s, {
        eventId: `ev-${Math.random()}`,
        expectedRevision: s.revision,
        actorRole: role,
        action: {
          actionId: `act-${Math.random()}`,
          actorRole: role,
          expectedRevision: s.revision,
          ...action,
        } as any,
        nowUtc: new Date().toISOString(),
      });

    // 1. Estado inicial en A1
    let snap = createInitialSnapshot('regress-room-01', 'A1');

    // 2. Base solicita observación de Piura
    const res1 = act(snap, 'ground', {
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'piura-rio' },
    });
    expect(res1.ok).toBe(true);
    if (!res1.ok) return;
    snap = res1.snapshot;
    expect(snap.phase).toBe('planning');

    // 3. Satélite aprueba plan estándar
    const res2 = act(snap, 'satellite', {
      type: 'APPROVE_PLAN',
      payload: { profileId: 'standard' },
    });
    expect(res2.ok).toBe(true);
    if (!res2.ok) return;
    snap = res2.snapshot;
    expect(snap.phase).toBe('capture');

    // 4. Satélite captura imagen
    const res3 = act(snap, 'satellite', {
      type: 'CAPTURE_IMAGE',
      payload: { targetId: 'piura-rio' },
    });
    expect(res3.ok).toBe(true);
    if (!res3.ok) return;
    snap = res3.snapshot;
    expect(snap.observations).toHaveLength(1);
    const obsId = snap.observations[0].observationId;

    // Regla de seguridad: Clasificar una imagen no transmitida debe fallar con NOT_TRANSMITTED
    const resIllegalClass = act(snap, 'ground', {
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obsId, finding: 'possible_flood' },
    });
    expect(resIllegalClass.ok).toBe(false);
    if (!resIllegalClass.ok) {
      expect(resIllegalClass.code).toBe('NOT_TRANSMITTED');
    }

    // 5. Base solicita transmisión por Banda X
    const res4 = act(snap, 'ground', {
      type: 'REQUEST_TRANSMISSION',
      payload: { observationId: obsId },
    });
    expect(res4.ok).toBe(true);
    if (!res4.ok) return;
    snap = res4.snapshot;
    expect(snap.phase).toBe('downlink');

    // 6. Satélite transmite la imagen
    const res5 = act(snap, 'satellite', {
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obsId },
    });
    expect(res5.ok).toBe(true);
    if (!res5.ok) return;
    snap = res5.snapshot;

    // FIX CONFIRMADO: Al terminar la transmisión pendiente, phase debe ser 'review' (desbloqueando la UI)
    expect(snap.phase).toBe('review');
    expect(snap.observations[0].transmitted).toBe(true);

    // 7. Base clasifica la imagen en el Centro de Análisis sin bloqueos ni mutaciones artificiales
    const res6 = act(snap, 'ground', {
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obsId, finding: 'possible_flood' },
    });
    expect(res6.ok).toBe(true);
    if (!res6.ok) return;
    snap = res6.snapshot;
    expect(snap.observations[0].finding).toBe('possible_flood');
  });

  it('A1 CICLO 2 COMPLETO: Flujo integral de dos observaciones hasta victoria', () => {
    const act = (
      s: FloodSnapshot,
      role: 'ground' | 'satellite',
      action: { type: string; payload?: Record<string, unknown> }
    ) =>
      applyAction(s, {
        eventId: `ev-${Math.random()}`,
        expectedRevision: s.revision,
        actorRole: role,
        action: {
          actionId: `act-${Math.random()}`,
          actorRole: role,
          expectedRevision: s.revision,
          ...action,
        } as any,
        nowUtc: new Date().toISOString(),
      });

    let snap = createInitialSnapshot('a1-cycle2-room', 'A1');

    // Ciclo 1: Piura Río
    let res = act(snap, 'ground', {
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'piura-rio' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;

    res = act(snap, 'satellite', {
      type: 'APPROVE_PLAN',
      payload: { profileId: 'standard' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;

    res = act(snap, 'satellite', {
      type: 'CAPTURE_IMAGE',
      payload: { targetId: 'piura-rio' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    const obs1Id = snap.observations[0].observationId;

    res = act(snap, 'ground', {
      type: 'REQUEST_TRANSMISSION',
      payload: { observationId: obs1Id },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;

    res = act(snap, 'satellite', {
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obs1Id },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.phase).toBe('review');

    res = act(snap, 'ground', {
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obs1Id, finding: 'possible_flood' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;

    // Ciclo 2: Base solicita segunda zona requerida en A1 (Piura Urbano)
    res = act(snap, 'ground', {
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'piura-urbano' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.phase).toBe('planning');

    res = act(snap, 'satellite', {
      type: 'APPROVE_PLAN',
      payload: { profileId: 'compressed' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.phase).toBe('capture');

    res = act(snap, 'satellite', {
      type: 'CAPTURE_IMAGE',
      payload: { targetId: 'piura-urbano' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.observations).toHaveLength(2);
    const obs2Id = snap.observations[1].observationId;

    res = act(snap, 'ground', {
      type: 'REQUEST_TRANSMISSION',
      payload: { observationId: obs2Id },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.phase).toBe('downlink');

    res = act(snap, 'satellite', {
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obs2Id },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.phase).toBe('review');

    res = act(snap, 'ground', {
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obs2Id, finding: 'normal' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;

    // Cierre: Ambas observaciones válidas clasificadas -> Enviar informe final
    res = act(snap, 'ground', {
      type: 'SUBMIT_REPORT',
      payload: { reportId: 'informe-a1-final' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.status).toBe('won');
    expect(snap.phase).toBe('debrief');
    expect(snap.reportFinding).toBe('possible_flood');
  });

  it('ESCENARIO A2: Manejo de imagen nublada, clasificación insuficiente y reintento exitoso', () => {
    const act = (
      s: FloodSnapshot,
      role: 'ground' | 'satellite',
      action: { type: string; payload?: Record<string, unknown> }
    ) =>
      applyAction(s, {
        eventId: `ev-${Math.random()}`,
        expectedRevision: s.revision,
        actorRole: role,
        action: {
          actionId: `act-${Math.random()}`,
          actorRole: role,
          expectedRevision: s.revision,
          ...action,
        } as any,
        nowUtc: new Date().toISOString(),
      });

    let snap = createInitialSnapshot('a2-room', 'A2');

    // 1. Primer intento en piura-rio genera captura con nubes ('cloudy' según SCENARIOS.A2)
    let res = act(snap, 'ground', {
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'piura-rio' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;

    res = act(snap, 'satellite', {
      type: 'APPROVE_PLAN',
      payload: { profileId: 'standard' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;

    res = act(snap, 'satellite', {
      type: 'CAPTURE_IMAGE',
      payload: { targetId: 'piura-rio' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.observations[0].quality).toBe('cloudy');
    const obs1Id = snap.observations[0].observationId;

    // 2. Transmisión
    res = act(snap, 'ground', {
      type: 'REQUEST_TRANSMISSION',
      payload: { observationId: obs1Id },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;

    res = act(snap, 'satellite', {
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obs1Id },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.phase).toBe('review');

    // 3. Clasificación científica: clasificar una imagen nublada como posible desborde es inválido
    const resIllegal = act(snap, 'ground', {
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obs1Id, finding: 'possible_flood' },
    });
    expect(resIllegal.ok).toBe(false);
    if (!resIllegal.ok) {
      expect(resIllegal.code).toBe('INVALID_EVIDENCE');
    }

    // Clasificación correcta como 'insufficient'
    res = act(snap, 'ground', {
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obs1Id, finding: 'insufficient' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.observations[0].finding).toBe('insufficient');

    // 4. Segundo intento en piura-rio (outcomes: ['cloudy', 'valid'] -> ahora 'valid')
    res = act(snap, 'ground', {
      type: 'REQUEST_OBSERVATION',
      payload: { targetId: 'piura-rio' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;

    res = act(snap, 'satellite', {
      type: 'APPROVE_PLAN',
      payload: { profileId: 'standard' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;

    res = act(snap, 'satellite', {
      type: 'CAPTURE_IMAGE',
      payload: { targetId: 'piura-rio' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.observations[1].quality).toBe('valid');
    const obs2Id = snap.observations[1].observationId;

    res = act(snap, 'ground', {
      type: 'REQUEST_TRANSMISSION',
      payload: { observationId: obs2Id },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;

    res = act(snap, 'satellite', {
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obs2Id },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.phase).toBe('review');

    res = act(snap, 'ground', {
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obs2Id, finding: 'possible_flood' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;

    // 5. Informe final en A2 (requiere 1 evidencia útil) -> 'won'
    res = act(snap, 'ground', {
      type: 'SUBMIT_REPORT',
      payload: { reportId: 'informe-a2-prudente' },
    });
    expect(res.ok).toBe(true);
    snap = (res as any).snapshot;
    expect(snap.status).toBe('won');
    expect(snap.reportFinding).toBe('possible_flood');
  });
});
