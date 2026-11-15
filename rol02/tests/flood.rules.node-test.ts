// Pruebas del motor de reglas de la Misión A (rol 02).
// Correr (Node 22.6+; en Node 24 ya no hace falta el flag):
//   node --experimental-strip-types --test tests/flood.rules.node-test.ts
// Portar a Vitest es mecánico: describe/it vienen de 'vitest' y assert.equal → expect().toBe().

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Finding, MissionAction, PlayerRole } from '../src/contracts/index.ts';
import type { AppliedEvent, ApplyResult, DenialCode, FloodSnapshot, ScenarioId } from '../src/missions/flood/types.ts';
import {
  applyAction,
  computeScore,
  createInitialSnapshot,
  eventsSinceLastReset,
  transmissionSeconds,
} from '../src/missions/flood/rules.ts';
import { PROFILES, SCENARIOS } from '../src/missions/flood/config.ts';

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
    act(role: PlayerRole, action: MissionAction): ApplyResult {
      n += 1;
      const r = applyAction(snap, {
        eventId: `evt-${n}`,
        expectedRevision: snap.revision,
        actorRole: role,
        action,
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
  assert.equal(r.ok, false, 'se esperaba una denegación');
  if (!r.ok) assert.equal(r.code, code);
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

describe('Misión A · reglas de simulación', () => {
  it('el tiempo de envío sigue la fórmula del documento', () => {
    assert.equal(transmissionSeconds(14), 28); // doc: 14 MB ≈ 28 s
    assert.equal(transmissionSeconds(28), 56); // doc: 28 MB ≈ 56 s
    assert.equal(transmissionSeconds(9), 18);
    assert.equal(transmissionSeconds(1), 2); // ceil
  });

  it('A1: recorrido completo gana con 100 puntos y recursos exactos', () => {
    const run = newRun('A1');
    const o1 = captureCycle(run, 'piura-rio');
    const o2 = captureCycle(run, 'piura-agricola');
    assert.equal(o1.quality, 'valid');
    assert.equal(o2.quality, 'valid');
    deliver(run, o1.observationId);
    deliver(run, o2.observationId);
    ok(classify(run, o1.observationId, 'possible_flood'));
    ok(classify(run, o2.observationId, 'normal'));
    const final = ok(run.act('ground', { type: 'SUBMIT_REPORT', reportId: 'rep-1' }));

    assert.equal(final.status, 'won');
    assert.equal(final.phase, 'debrief');
    assert.equal(final.reportFinding, 'possible_flood');
    // 100 − 2×12 − 2×4 = 68 Wh · 70 − 2×14 = 42 MB · 80 − 2×28 = 24 s · 100 − 2×10 = 80 créditos
    assert.equal(final.resources.energyWh, 68);
    assert.equal(final.resources.storageMb, 42);
    assert.equal(final.resources.contactSeconds, 24);
    assert.equal(final.resources.budgetCredits, 80);

    const score = computeScore(final, run.events);
    assert.equal(score.total, 100);
  });

  it('A2: una imagen nublada no puede clasificarse como evidencia', () => {
    const run = newRun('A2');
    const cloudy = captureCycle(run, 'piura-rio');
    assert.equal(cloudy.quality, 'cloudy'); // 1.er intento sobre el río
    deliver(run, cloudy.observationId);

    denied(classify(run, cloudy.observationId, 'possible_flood'), 'INVALID_EVIDENCE');
    denied(classify(run, cloudy.observationId, 'normal'), 'INVALID_EVIDENCE');
    ok(classify(run, cloudy.observationId, 'insufficient'));

    const retry = captureCycle(run, 'piura-rio');
    assert.equal(retry.quality, 'valid'); // 2.º intento: despejado
    deliver(run, retry.observationId);
    ok(classify(run, retry.observationId, 'possible_flood'));
    const final = ok(run.act('ground', { type: 'SUBMIT_REPORT', reportId: 'rep-2' }));

    assert.equal(final.status, 'won'); // A2 exige ≥ 1 observación válida
    // rigor max(0, 15 − 2×10 intentos de sobreafirmar) = 0 · ingeniería 25 · colaboración 20
    // · comunicación 8 (1 de 2 archivos útiles) · eficiencia 5 (1 de 2 capturas útiles) = 58
    assert.equal(computeScore(final, run.events).total, 58);
  });

  it('A2: la jugada prudente (no transmitir lo nublado) puntúa más', () => {
    const run = newRun('A2');
    const cloudy = captureCycle(run, 'piura-rio'); // el Satélite lo ve nublado y avisa
    const urban = captureCycle(run, 'piura-urbano');
    const riverOk = captureCycle(run, 'piura-rio');
    assert.equal(cloudy.quality, 'cloudy');
    assert.equal(riverOk.quality, 'valid');
    deliver(run, urban.observationId);
    deliver(run, riverOk.observationId);
    ok(classify(run, urban.observationId, 'possible_flood'));
    ok(classify(run, riverOk.observationId, 'possible_flood'));
    const final = ok(run.act('ground', { type: 'SUBMIT_REPORT', reportId: 'rep-3' }));

    assert.equal(final.status, 'won');
    assert.equal(final.resources.contactSeconds, 24);
    assert.equal(computeScore(final, run.events).total, 97); // eficiencia 2/3 → 7
  });

  it('dos archivos detallados no caben en 80 s (compensación detalle vs. ventana)', () => {
    const run = newRun('A1');
    const o1 = captureCycle(run, 'piura-rio', 'detailed');
    const o2 = captureCycle(run, 'piura-urbano', 'detailed');
    assert.equal(o1.sizeMb, PROFILES.detailed.sizeMb);
    deliver(run, o1.observationId); // 56 s → quedan 24 s
    ok(run.act('ground', { type: 'REQUEST_TRANSMISSION', observationId: o2.observationId }));
    const r = run.act('satellite', { type: 'TRANSMIT_IMAGE', observationId: o2.observationId });
    denied(r, 'EXCEEDS_CONTACT_WINDOW');
    assert.equal(run.snap.resources.contactSeconds, 24); // no se descontó nada
    assert.equal(run.snap.observations[1]!.transmitted, false);
  });

  it('sin energía: se deniega con explicación y nunca hay recursos negativos', () => {
    const run = newRun('A1');
    ok(run.act('ground', { type: 'REQUEST_OBSERVATION', targetId: 'piura-rio' }));
    run.patch((s) => {
      s.resources.energyWh = 10;
    });
    const atApproval = run.act('satellite', { type: 'APPROVE_PLAN', profileId: 'standard' });
    denied(atApproval, 'INSUFFICIENT_ENERGY');
    if (!atApproval.ok) assert.match(atApproval.message, /12 Wh/);

    run.patch((s) => {
      s.resources.energyWh = 100;
    });
    ok(run.act('satellite', { type: 'APPROVE_PLAN', profileId: 'standard' }));
    run.patch((s) => {
      s.resources.energyWh = 10;
    });
    denied(run.act('satellite', { type: 'CAPTURE_IMAGE', targetId: 'piura-rio' }), 'INSUFFICIENT_ENERGY');
    assert.equal(run.snap.resources.energyWh, 10);
    assert.equal(run.snap.observations.length, 0);
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
      action: { type: 'REQUEST_OBSERVATION', targetId: 'piura-rio' } as MissionAction,
      nowUtc: NOW,
    };
    const first = applyAction(s0, env);
    const s1 = ok(first);
    denied(applyAction(s1, env), 'STALE_REVISION'); // misma intención, revisión vieja
    assert.equal(s1.revision, 1);
  });

  it('informe sin evidencia válida: se pierde y la conclusión es "insuficiente"', () => {
    const run = newRun('A2');
    const cloudy = captureCycle(run, 'piura-rio');
    deliver(run, cloudy.observationId);
    ok(classify(run, cloudy.observationId, 'insufficient'));
    const final = ok(run.act('ground', { type: 'SUBMIT_REPORT', reportId: 'rep-4' }));
    assert.equal(final.status, 'lost');
    assert.equal(final.reportFinding, 'insufficient');
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
    assert.equal(fresh.revision, before + 1);
    assert.equal(fresh.phase, 'briefing');
    assert.equal(fresh.status, 'ready');
    assert.deepEqual(fresh.observations, []);
    assert.deepEqual(fresh.resources, SCENARIOS.A2.initialResources);
    assert.deepEqual(eventsSinceLastReset(run.events), []);
  });

  it('un plan aprobado sobrevive a pedir, transmitir y clasificar otra imagen', () => {
    const run = newRun('A1');
    const first = captureCycle(run, 'piura-rio');
    ok(run.act('ground', { type: 'REQUEST_OBSERVATION', targetId: 'piura-urbano' }));
    ok(run.act('satellite', { type: 'APPROVE_PLAN', profileId: 'standard' }));
    deliver(run, first.observationId);
    ok(classify(run, first.observationId, 'possible_flood'));
    assert.equal(run.snap.phase, 'capture'); // el plan sigue en curso
    const after = ok(run.act('satellite', { type: 'CAPTURE_IMAGE', targetId: 'piura-urbano' }));
    assert.equal(after.observations.length, 2);
    assert.equal(run.events.filter((e) => e.result === 'denied').length, 0); // sin penalización
  });

  it('una petición aún sin aprobar también sobrevive al envío de otra imagen', () => {
    const run = newRun('A1');
    const first = captureCycle(run, 'piura-rio');
    ok(run.act('ground', { type: 'REQUEST_OBSERVATION', targetId: 'piura-urbano' }));
    deliver(run, first.observationId);
    assert.equal(run.snap.phase, 'planning');
    ok(run.act('satellite', { type: 'APPROVE_PLAN', profileId: 'standard' }));
  });

  it('informe sin haber capturado nada: se pierde y el puntaje es 0', () => {
    const run = newRun('A1');
    ok(run.act('ground', { type: 'REQUEST_OBSERVATION', targetId: 'piura-rio' }));
    const final = ok(run.act('ground', { type: 'SUBMIT_REPORT', reportId: 'rep-6' }));
    assert.equal(final.status, 'lost');
    const score = computeScore(final, run.events);
    assert.equal(score.total, 0);
    assert.equal(score.breakdown.engineering, 0);
    assert.equal(score.breakdown.collaboration, 0);
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

// ---------------------------------------------------------------------------------------
// Prueba de propiedades: acciones aleatorias (con semilla fija) de ambos roles. Las reglas
// invariables del documento deben cumplirse en TODOS los estados alcanzables.
// ---------------------------------------------------------------------------------------

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
  if (r < 0.2) return { type: 'REQUEST_OBSERVATION', targetId: pick(targets) };
  if (r < 0.35) return { type: 'APPROVE_PLAN', profileId: pick(profiles) };
  if (r < 0.5) {
    const targetId = s.selectedTargetId !== undefined && rnd() < 0.8 ? s.selectedTargetId : pick(targets);
    return { type: 'CAPTURE_IMAGE', targetId };
  }
  if (r < 0.62) return { type: 'REQUEST_TRANSMISSION', observationId: pick(obsIds) };
  if (r < 0.76) return { type: 'TRANSMIT_IMAGE', observationId: pick(obsIds) };
  if (r < 0.9) return { type: 'CLASSIFY_IMAGE', observationId: pick(obsIds), finding: pick(findings) };
  if (r < 0.93) return { type: 'SUBMIT_REPORT', reportId: rnd() < 0.9 ? 'rep-fuzz' : '' };
  return { type: 'RESET_MISSION' };
}

function assertInvariants(s: FloodSnapshot): void {
  const initial = SCENARIOS[s.scenarioId].initialResources;
  for (const value of Object.values(s.resources)) {
    assert.ok(Number.isFinite(value) && value >= 0, `recurso negativo o inválido: ${JSON.stringify(s.resources)}`);
  }
  assert.ok(s.resources.energyWh <= initial.energyWh);
  assert.ok(s.resources.storageMb <= initial.storageMb);
  assert.ok(s.resources.contactSeconds <= initial.contactSeconds);
  assert.ok(s.resources.budgetCredits <= initial.budgetCredits);

  for (const o of s.observations) {
    if (o.transmitted) assert.ok(o.requested, 'transmitida sin que la Base la pidiera');
    if (o.finding !== undefined) assert.ok(o.transmitted, 'clasificada sin haber llegado a la Base');
    if (o.finding !== undefined && o.finding !== 'insufficient') {
      assert.equal(o.quality, 'valid', 'archivo no válido tratado como evidencia');
    }
  }

  // Conservación: lo gastado coincide exactamente con lo que dicen las observaciones.
  const captures = s.observations.length;
  const sent = s.observations.filter((o) => o.transmitted);
  assert.equal(s.resources.energyWh, initial.energyWh - 12 * captures - 4 * sent.length);
  assert.equal(
    s.resources.storageMb,
    initial.storageMb - s.observations.reduce((acc, o) => acc + o.sizeMb, 0),
  );
  assert.equal(
    s.resources.contactSeconds,
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

          assert.equal(JSON.stringify(snap), frozen, 'el motor mutó el estado de entrada');
          if (r.ok) {
            assert.equal(r.snapshot.revision, snap.revision + 1);
            accepted[action.type] = (accepted[action.type] ?? 0) + 1;
            snap = r.snapshot;
          } else {
            assert.equal(r.event.revision, snap.revision);
            assert.ok(r.message.length > 0);
          }
          if (phaseBefore === 'debrief' && action.type !== 'RESET_MISSION') {
            assert.equal(r.ok, false, 'se aceptó una acción tras terminar la misión');
          }
          assertInvariants(snap);
        }
      }
    }
    // La prueba no es vacía: se ejercitó todo el recorrido.
    for (const t of ['REQUEST_OBSERVATION', 'APPROVE_PLAN', 'CAPTURE_IMAGE', 'REQUEST_TRANSMISSION', 'TRANSMIT_IMAGE', 'CLASSIFY_IMAGE', 'SUBMIT_REPORT', 'RESET_MISSION']) {
      assert.ok((accepted[t] ?? 0) > 0, `la prueba aleatoria nunca aceptó ${t}`);
    }
  });
});
