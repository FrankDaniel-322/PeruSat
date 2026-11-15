import { describe, expect, it } from 'vitest';
import type { Finding, MissionAction, PlayerRole } from '../../../contracts/mission';
import type { AppliedEvent, ApplyResult, DenialCode, FloodSnapshot, ScenarioId } from '../types';
import {
  applyAction,
  computeScore,
  createInitialSnapshot,
  eventsSinceLastReset,
  transmissionSeconds,
} from '../rules';
import { PROFILES, SCENARIOS } from '../config';

const NOW = '2026-11-14T15:00:00Z';

function newRun(scenarioId: ScenarioId) {
  let snap: FloodSnapshot = createInitialSnapshot('room-test', scenarioId);
  const events: AppliedEvent[] = [];
  let n = 0;
  return {
    get snap(): FloodSnapshot {
      return snap;
    },
    events,
    act(role: PlayerRole, action: Partial<MissionAction> & { type: MissionAction['type']; [k: string]: unknown }): ApplyResult {
      n += 1;
      const r = applyAction(snap, {
        eventId: `evt-${n}`,
        expectedRevision: snap.revision,
        actorRole: role,
        action: action as unknown as MissionAction,
        nowUtc: NOW,
      });
      events.push(r.event);
      if (r.ok) snap = r.snapshot;
      return r;
    },
    patch(fn: (s: FloodSnapshot) => void): void {
      snap = structuredClone(snap);
      fn(snap);
    },
  };
}
type Run = ReturnType<typeof newRun>;

function ok(r: ApplyResult): FloodSnapshot {
  if (!r.ok) throw new Error(`Se esperaba aceptada, pero fue denegada: ${r.code} · ${r.message}`);
  return r.snapshot;
}

function denied(r: ApplyResult, code: DenialCode): void {
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.code).toBe(code);
}

/** Base pide, Satélite aprueba y captura. Devuelve la observación creada. */
function captureCycle(run: Run, targetId: string, profileId = 'standard') {
  ok(run.act('ground', { type: 'REQUEST_OBSERVATION', targetId }));
  ok(run.act('satellite', { type: 'APPROVE_PLAN', profileId }));
  const snap = ok(run.act('satellite', { type: 'CAPTURE_IMAGE', targetId }));
  return snap.observations[snap.observations.length - 1]!;
}

/** Base pide transmitir y Satélite transmite. */
function deliver(run: Run, observationId: string): void {
  ok(run.act('ground', { type: 'REQUEST_TRANSMISSION', observationId }));
  ok(run.act('satellite', { type: 'TRANSMIT_IMAGE', observationId }));
}

function classify(run: Run, observationId: string, finding: Finding): ApplyResult {
  return run.act('ground', { type: 'CLASSIFY_IMAGE', observationId, finding });
}

describe('Misión A · reglas de simulación (Vitest)', () => {
  it('el tiempo de envío sigue la fórmula del documento', () => {
    expect(transmissionSeconds(14)).toBe(28); // 14 MB ≈ 28 s
    expect(transmissionSeconds(28)).toBe(56); // 28 MB ≈ 56 s
    expect(transmissionSeconds(9)).toBe(18);
    expect(transmissionSeconds(1)).toBe(2); // ceil
  });

  it('A1: recorrido completo gana con 100 puntos y recursos exactos', () => {
    const run = newRun('A1');
    const o1 = captureCycle(run, 'piura-rio');
    const o2 = captureCycle(run, 'piura-agricola');
    expect(o1.quality).toBe('valid');
    expect(o2.quality).toBe('valid');
    deliver(run, o1.observationId);
    deliver(run, o2.observationId);
    ok(classify(run, o1.observationId, 'possible_flood'));
    ok(classify(run, o2.observationId, 'normal'));
    const final = ok(run.act('ground', { type: 'SUBMIT_REPORT', reportId: 'rep-1' }));

    expect(final.status).toBe('won');
    expect(final.phase).toBe('debrief');
    expect(final.reportFinding).toBe('possible_flood');
    // 100 − 2×12 − 2×4 = 68 Wh · 70 − 2×14 = 42 MB · 80 − 2×28 = 24 s · 100 − 2×10 = 80 créditos
    expect(final.resources.energyWh).toBe(68);
    expect(final.resources.storageMb).toBe(42);
    expect(final.resources.contactSeconds).toBe(24);
    expect(final.resources.budgetCredits).toBe(80);

    const score = computeScore(final, run.events);
    expect(score.total).toBe(100);
  });

  it('A2: una imagen nublada no puede clasificarse como evidencia', () => {
    const run = newRun('A2');
    const cloudy = captureCycle(run, 'piura-rio');
    expect(cloudy.quality).toBe('cloudy'); // 1.er intento sobre el río
    deliver(run, cloudy.observationId);

    denied(classify(run, cloudy.observationId, 'possible_flood'), 'INVALID_EVIDENCE');
    denied(classify(run, cloudy.observationId, 'normal'), 'INVALID_EVIDENCE');
    ok(classify(run, cloudy.observationId, 'insufficient'));

    const retry = captureCycle(run, 'piura-rio');
    expect(retry.quality).toBe('valid'); // 2.º intento: despejado
    deliver(run, retry.observationId);
    ok(classify(run, retry.observationId, 'possible_flood'));
    const final = ok(run.act('ground', { type: 'SUBMIT_REPORT', reportId: 'rep-2' }));

    expect(final.status).toBe('won'); // A2 exige ≥ 1 observación válida
    expect(computeScore(final, run.events).total).toBe(58);
  });

  it('A2: la jugada prudente (no transmitir lo nublado) puntúa más', () => {
    const run = newRun('A2');
    const cloudy = captureCycle(run, 'piura-rio'); // el Satélite lo ve nublado y avisa
    const urban = captureCycle(run, 'piura-urbano');
    const riverOk = captureCycle(run, 'piura-rio');
    expect(cloudy.quality).toBe('cloudy');
    expect(riverOk.quality).toBe('valid');
    deliver(run, urban.observationId);
    deliver(run, riverOk.observationId);
    ok(classify(run, urban.observationId, 'possible_flood'));
    ok(classify(run, riverOk.observationId, 'possible_flood'));
    const final = ok(run.act('ground', { type: 'SUBMIT_REPORT', reportId: 'rep-3' }));

    expect(final.status).toBe('won');
    expect(final.resources.contactSeconds).toBe(24);
    expect(computeScore(final, run.events).total).toBe(97); // eficiencia 2/3 → 7
  });

  it('dos archivos detallados no caben en 80 s (compensación detalle vs. ventana)', () => {
    const run = newRun('A1');
    const o1 = captureCycle(run, 'piura-rio', 'detailed');
    const o2 = captureCycle(run, 'piura-urbano', 'detailed');
    expect(o1.sizeMb).toBe(PROFILES.detailed.sizeMb);
    deliver(run, o1.observationId); // 56 s → quedan 24 s
    ok(run.act('ground', { type: 'REQUEST_TRANSMISSION', observationId: o2.observationId }));
    const r = run.act('satellite', { type: 'TRANSMIT_IMAGE', observationId: o2.observationId });
    denied(r, 'EXCEEDS_CONTACT_WINDOW');
    expect(run.snap.resources.contactSeconds).toBe(24); // no se descontó nada
    expect(run.snap.observations[1]!.transmitted).toBe(false);
  });

  it('sin energía: se deniega con explicación y nunca hay recursos negativos', () => {
    const run = newRun('A1');
    ok(run.act('ground', { type: 'REQUEST_OBSERVATION', targetId: 'piura-rio' }));
    run.patch((s) => {
      s.resources.energyWh = 10;
    });
    const atApproval = run.act('satellite', { type: 'APPROVE_PLAN', profileId: 'standard' });
    denied(atApproval, 'INSUFFICIENT_ENERGY');
    if (!atApproval.ok) expect(atApproval.message).toMatch(/12 Wh/);

    run.patch((s) => {
      s.resources.energyWh = 100;
    });
    ok(run.act('satellite', { type: 'APPROVE_PLAN', profileId: 'standard' }));
    run.patch((s) => {
      s.resources.energyWh = 10;
    });
    denied(run.act('satellite', { type: 'CAPTURE_IMAGE', targetId: 'piura-rio' }), 'INSUFFICIENT_ENERGY');
    expect(run.snap.resources.energyWh).toBe(10);
    expect(run.snap.observations.length).toBe(0);
  });

  it('cada rol solo puede ejecutar sus acciones', () => {
    const run = newRun('A1');
    denied(run.act('ground', { type: 'CAPTURE_IMAGE', targetId: 'piura-rio' }), 'WRONG_ROLE');
    denied(run.act('satellite', { type: 'REQUEST_OBSERVATION', targetId: 'piura-rio' }), 'WRONG_ROLE');
  });

  it('el Satélite no transmite sin que la Base lo pida', () => {
    const run = newRun('A1');
    const o1 = captureCycle(run, 'piura-rio');
    denied(
      run.act('satellite', { type: 'TRANSMIT_IMAGE', observationId: o1.observationId }),
      'NOT_REQUESTED',
    );
  });

  it('reenviar la misma acción no descuenta recursos dos veces', () => {
    const s0 = createInitialSnapshot('room-test', 'A1');
    const env = {
      eventId: 'evt-dup',
      expectedRevision: 0,
      actorRole: 'ground' as const,
      action: { type: 'REQUEST_OBSERVATION', payload: { targetId: 'piura-rio' } } as unknown as MissionAction,
      nowUtc: NOW,
    };
    const first = applyAction(s0, env);
    const s1 = ok(first);
    denied(applyAction(s1, env), 'STALE_REVISION'); // misma intención, revisión vieja
    expect(s1.revision).toBe(1);
  });

  it('informe sin evidencia válida: se pierde y la conclusión es "insuficiente"', () => {
    const run = newRun('A2');
    const cloudy = captureCycle(run, 'piura-rio');
    deliver(run, cloudy.observationId);
    ok(classify(run, cloudy.observationId, 'insufficient'));
    const final = ok(run.act('ground', { type: 'SUBMIT_REPORT', reportId: 'rep-4' }));
    expect(final.status).toBe('lost');
    expect(final.reportFinding).toBe('insufficient');
  });

  it('tras terminar solo se acepta reiniciar, y el puntaje ignora la partida anterior', () => {
    const run = newRun('A2');
    const cloudy = captureCycle(run, 'piura-rio');
    deliver(run, cloudy.observationId);
    denied(classify(run, cloudy.observationId, 'possible_flood'), 'INVALID_EVIDENCE');
    ok(classify(run, cloudy.observationId, 'insufficient'));
    ok(run.act('ground', { type: 'SUBMIT_REPORT', reportId: 'rep-5' }));

    denied(run.act('ground', { type: 'REQUEST_OBSERVATION', targetId: 'piura-rio' }), 'MISSION_FINISHED');

    const before = run.snap.revision;
    const fresh = ok(run.act('satellite', { type: 'RESET_MISSION' }));
    expect(fresh.revision).toBe(before + 1);
    expect(fresh.phase).toBe('briefing');
    expect(fresh.status).toBe('ready');
    expect(fresh.observations).toEqual([]);
    expect(fresh.resources).toEqual(SCENARIOS.A2.initialResources);
    expect(eventsSinceLastReset(run.events)).toEqual([]);
  });

  it('un plan aprobado sobrevive a pedir, transmitir y clasificar otra imagen', () => {
    const run = newRun('A1');
    const first = captureCycle(run, 'piura-rio');
    ok(run.act('ground', { type: 'REQUEST_OBSERVATION', targetId: 'piura-urbano' }));
    ok(run.act('satellite', { type: 'APPROVE_PLAN', profileId: 'standard' }));
    deliver(run, first.observationId);
    ok(classify(run, first.observationId, 'possible_flood'));
    expect(run.snap.phase).toBe('capture'); // el plan sigue en curso
    const after = ok(run.act('satellite', { type: 'CAPTURE_IMAGE', targetId: 'piura-urbano' }));
    expect(after.observations.length).toBe(2);
    expect(run.events.filter((e) => e.result === 'denied').length).toBe(0); // sin penalización
  });

  it('una petición aún sin aprobar también sobrevive al envío de otra imagen', () => {
    const run = newRun('A1');
    const first = captureCycle(run, 'piura-rio');
    ok(run.act('ground', { type: 'REQUEST_OBSERVATION', targetId: 'piura-urbano' }));
    deliver(run, first.observationId);
    expect(run.snap.phase).toBe('planning');
    ok(run.act('satellite', { type: 'APPROVE_PLAN', profileId: 'standard' }));
  });

  it('informe sin haber capturado nada: se pierde y el puntaje es 0', () => {
    const run = newRun('A1');
    ok(run.act('ground', { type: 'REQUEST_OBSERVATION', targetId: 'piura-rio' }));
    const final = ok(run.act('ground', { type: 'SUBMIT_REPORT', reportId: 'rep-6' }));
    expect(final.status).toBe('lost');
    const score = computeScore(final, run.events);
    expect(score.total).toBe(0);
    expect(score.breakdown.engineering).toBe(0);
    expect(score.breakdown.collaboration).toBe(0);
  });

  it('una acción mal formada se deniega sin romper el motor', () => {
    const s0 = createInitialSnapshot('room-test', 'A1');
    for (const bad of [null, undefined, 42, {}, { type: 7 }, { type: 'toString' }]) {
      const r = applyAction(s0, {
        eventId: 'evt-bad',
        expectedRevision: 0,
        actorRole: 'ground',
        action: bad as unknown as MissionAction,
        nowUtc: NOW,
      });
      denied(r, 'UNKNOWN_ACTION');
    }
  });
});

// Prueba de invariantes con generador pseudoaleatorio determinista (10 partidas x 1500 acciones)
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomAction(rnd: () => number, s: FloodSnapshot): MissionAction {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const targets = ['piura-rio', 'piura-urbano', 'piura-agricola', 'bogus'];
  const profiles = ['standard', 'detailed', 'compressed', 'bogus'];
  const obsIds = [...s.observations.map((o) => o.observationId), 'obs-99'];
  const findings: readonly Finding[] = ['normal', 'possible_flood', 'insufficient'];
  const r = rnd();
  const base = { actionId: `act-${Math.floor(rnd() * 100000)}`, actorRole: 'ground' as PlayerRole, expectedRevision: s.revision };

  if (r < 0.2) return { ...base, type: 'REQUEST_OBSERVATION', payload: { targetId: pick(targets) } };
  if (r < 0.35) return { ...base, actorRole: 'satellite', type: 'APPROVE_PLAN', payload: { profileId: pick(profiles) } };
  if (r < 0.5) {
    const targetId = s.selectedTargetId !== undefined && rnd() < 0.8 ? s.selectedTargetId : pick(targets);
    return { ...base, actorRole: 'satellite', type: 'CAPTURE_IMAGE', payload: { targetId } };
  }
  if (r < 0.62) return { ...base, type: 'REQUEST_TRANSMISSION', payload: { observationId: pick(obsIds) } };
  if (r < 0.76) return { ...base, actorRole: 'satellite', type: 'TRANSMIT_IMAGE', payload: { observationId: pick(obsIds) } };
  if (r < 0.9) {
    const unclassified = s.observations.find((o) => o.transmitted && o.finding === undefined);
    const obsId = unclassified && rnd() < 0.8 ? unclassified.observationId : pick(obsIds);
    const finding = unclassified && unclassified.quality !== 'valid' ? 'insufficient' : pick(findings);
    return { ...base, type: 'CLASSIFY_IMAGE', payload: { observationId: obsId, finding } };
  }
  if (r < 0.93) return { ...base, type: 'SUBMIT_REPORT', payload: { reportId: rnd() < 0.9 ? 'rep-fuzz' : '', finding: pick(findings) } };
  return { ...base, type: 'RESET_MISSION', payload: {} };
}

function assertInvariants(s: FloodSnapshot): void {
  const initial = SCENARIOS[s.scenarioId].initialResources;
  for (const value of Object.values(s.resources)) {
    expect(Number.isFinite(value) && value >= 0).toBe(true);
  }
  expect(s.resources.energyWh).toBeLessThanOrEqual(initial.energyWh);
  expect(s.resources.storageMb).toBeLessThanOrEqual(initial.storageMb);
  expect(s.resources.contactSeconds).toBeLessThanOrEqual(initial.contactSeconds);
  expect(s.resources.budgetCredits).toBeLessThanOrEqual(initial.budgetCredits);

  for (const o of s.observations) {
    if (o.transmitted) expect(o.requested).toBe(true);
    if (o.finding !== undefined) expect(o.transmitted).toBe(true);
    if (o.finding !== undefined && o.finding !== 'insufficient') {
      expect(o.quality).toBe('valid');
    }
  }

  const captures = s.observations.length;
  const sent = s.observations.filter((o) => o.transmitted);
  expect(s.resources.energyWh).toBe(initial.energyWh - 12 * captures - 4 * sent.length);
  expect(s.resources.storageMb).toBe(
    initial.storageMb - s.observations.reduce((acc, o) => acc + o.sizeMb, 0),
  );
  expect(s.resources.contactSeconds).toBe(
    initial.contactSeconds - sent.reduce((acc, o) => acc + transmissionSeconds(o.sizeMb), 0),
  );
}

describe('Misión A · invariantes bajo acciones aleatorias', () => {
  it('se cumplen en 10 partidas simuladas de 1500 acciones', () => {
    const accepted: Record<string, number> = {};
    for (const scenarioId of ['A1', 'A2'] as const) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const rnd = mulberry32(seed * 7919);
        let snap = createInitialSnapshot('room-fuzz', scenarioId);
        for (let i = 0; i < 1500; i += 1) {
          const action = randomAction(rnd, snap);
          const role: PlayerRole = rnd() < 0.5 ? 'ground' : 'satellite';
          const expectedRevision = rnd() < 0.85 ? snap.revision : snap.revision - 1;
          const frozen = JSON.stringify(snap);
          const phaseBefore = snap.phase;

          const r = applyAction(snap, {
            eventId: `fz-${scenarioId}-${seed}-${i}`,
            expectedRevision,
            actorRole: role,
            action,
            nowUtc: NOW,
          });

          expect(JSON.stringify(snap)).toBe(frozen);
          if (r.ok) {
            expect(r.snapshot.revision).toBe(snap.revision + 1);
            accepted[action.type] = (accepted[action.type] ?? 0) + 1;
            snap = r.snapshot;
          } else {
            expect(r.event.revision).toBe(snap.revision);
            expect(r.message.length).toBeGreaterThan(0);
          }
          if (phaseBefore === 'debrief' && action.type !== 'RESET_MISSION') {
            expect(r.ok).toBe(false);
          }
          assertInvariants(snap);
        }
      }
    }
    for (const t of [
      'REQUEST_OBSERVATION',
      'APPROVE_PLAN',
      'CAPTURE_IMAGE',
      'REQUEST_TRANSMISSION',
      'TRANSMIT_IMAGE',
      'CLASSIFY_IMAGE',
      'SUBMIT_REPORT',
      'RESET_MISSION',
    ]) {
      expect((accepted[t] ?? 0)).toBeGreaterThan(0);
    }
  }, 15000);
});
