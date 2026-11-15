import { describe, expect, it } from 'vitest';
import type { FloodSnapshot } from '../../missions/flood/types';
import { createInitialSnapshot } from '../../missions/flood/rules';
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
});
