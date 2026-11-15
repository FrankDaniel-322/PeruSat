import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { MissionSnapshot, PlayerRole, Quality } from '../contracts/mission';
import type { ConnectionState } from '../core/MissionGateway';
import { DevMissionGateway } from '../devtools/DevMissionGateway';
import { createMissionStore, type MissionStore } from '../store/missionStore';
import { actionForStep, demoSteps, type DemoScenario } from './demoSteps';

const roomId = 'role01-visual-demo';
const gateway = new DevMissionGateway();
gateway.faultConfig.simulatedLatencyMs = 550;
const groundStore = createMissionStore(gateway);
const satelliteStore = createMissionStore(gateway);

const phaseNames: Record<MissionSnapshot['phase'], string> = {
  briefing: 'Briefing', planning: 'Planificación', capture: 'Captura',
  downlink: 'Enlace descendente', review: 'Revisión', debrief: 'Informe final',
};

const connectionNames: Record<ConnectionState, string> = {
  disconnected: 'Sin conexión', connecting: 'Conectando',
  connected: 'Conectado', reconnecting: 'Reconectando',
};

function Resource({ label, value, unit }: { label: string; value: number | undefined; unit: string }) {
  return <div className="demo-resource"><span>{label}</span><strong>{value === undefined ? '—' : `${value} ${unit}`}</strong></div>;
}

function Panel({ role, store, stepIndex }: { role: PlayerRole; store: MissionStore; stepIndex: number }) {
  const snapshot = useStore(store, (state) => state.snapshot);
  const connection = useStore(store, (state) => state.connection);
  const pending = useStore(store, (state) => state.pending);
  const error = useStore(store, (state) => state.error);
  const observation = snapshot?.observations.at(-1);
  const isGround = role === 'ground';
  const title = isGround ? 'Base CNOIS' : 'Satélite PerúSAT-1';
  const roleDescription = isGround ? 'Solicita, revisa y reporta' : 'Planifica, captura y transmite';
  const request = !snapshot?.selectedTargetId
    ? 'Aún no hay solicitud'
    : ({
      briefing: 'Solicitud pendiente',
      planning: 'Solicitud recibida · esperando aprobación',
      capture: 'Plan aprobado · esperando captura',
      downlink: 'Captura a bordo · transmisión pendiente',
      review: 'Imagen recibida · en revisión',
      debrief: 'Solicitud atendida · informe emitido',
    } satisfies Record<MissionSnapshot['phase'], string>)[snapshot.phase];
  const qualityNames: Record<Quality, string> = {
    valid: 'Válida', cloudy: 'Cubierta por nubes', corrupt: 'Archivo corrupto', incomplete: 'Incompleta',
  };

  return (
    <section className={`demo-panel ${isGround ? 'demo-ground' : 'demo-satellite'}`} aria-label={title}>
      <div className="demo-panel-head">
        <div className="demo-role-mark" aria-hidden="true">{isGround ? '⌖' : '✦'}</div>
        <div><p className="demo-eyebrow">{isGround ? 'OPERADOR EN TIERRA' : 'OPERADOR EN ÓRBITA'}</p><h2>{title}</h2><p>{roleDescription}</p></div>
      </div>

      <div className="demo-status-row">
        <span className={`demo-pill demo-${connection}`}>{connectionNames[connection]}</span>
        {pending && <span className="demo-pill demo-pending" role="status">Esperando confirmación…</span>}
        {!pending && snapshot && stepIndex > 0 && !error && <span className="demo-pill demo-confirmed">Cambio confirmado · rev. {snapshot.revision}</span>}
      </div>
      {error && <div className="demo-error" role="alert"><strong>{error.code}</strong><span>{error.message}</span></div>}

      <div className="demo-phase-card">
        <span>Fase actual</span>
        <strong>{snapshot ? phaseNames[snapshot.phase] : 'Cargando misión…'}</strong>
        <small>{snapshot ? `Estado ${snapshot.status} · revisión ${snapshot.revision}` : 'Esperando snapshot confirmado'}</small>
      </div>

      <div className="demo-resource-grid">
        <Resource label="Presupuesto" value={snapshot?.resources.budgetCredits} unit="créditos" />
        <Resource label="Energía" value={snapshot?.resources.energyWh} unit="Wh" />
        <Resource label="Almacenamiento" value={snapshot?.resources.storageMb} unit="MB" />
        <Resource label="Contacto" value={snapshot?.resources.contactSeconds} unit="s" />
      </div>

      <div className="demo-request">
        <div className="demo-section-title">ESTADO DE LA SOLICITUD</div>
        <p>{request}</p>
        {observation && <div className="demo-observation">
          <span className="demo-simulated">SIMULADO</span>
          <span>Imagen {qualityNames[observation.quality]}</span>
          <span>{observation.transmitted ? 'Recibida en Base' : 'A bordo del satélite'}</span>
        </div>}
      </div>
    </section>
  );
}

export function Role01Demo() {
  const [scenario, setScenario] = useState<DemoScenario>('routine');
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [confirmation, setConfirmation] = useState('Esperando primera solicitud de Base.');
  const runToken = useRef(0);
  const ground = useStore(groundStore, (state) => state.snapshot);
  const connection = useStore(groundStore, (state) => state.connection);
  const satelliteConnection = useStore(satelliteStore, (state) => state.connection);
  const pendingGround = useStore(groundStore, (state) => state.pending);
  const pendingSatellite = useStore(satelliteStore, (state) => state.pending);
  const lastErrorGround = useStore(groundStore, (state) => state.error);
  const lastErrorSatellite = useStore(satelliteStore, (state) => state.error);
  const bothConnected = connection === 'connected' && satelliteConnection === 'connected' && !!ground;
  const busy = playing || pendingGround || pendingSatellite;

  useEffect(() => {
    void groundStore.getState().connect(roomId);
    void satelliteStore.getState().connect(roomId);
    return () => {
      ++runToken.current;
      groundStore.getState().resetUi();
      satelliteStore.getState().resetUi();
    };
  }, []);

  async function advance(index: number, selectedScenario: DemoScenario): Promise<boolean> {
    const role = demoSteps[index]?.role;
    if (!role) return false;
    const store = role === 'ground' ? groundStore : satelliteStore;
    const before = store.getState().snapshot;
    if (!before) return false;
    const action = actionForStep(index, before, selectedScenario);
    if (!action) {
      setConfirmation('Falta una observación confirmada para continuar.');
      return false;
    }
    setConfirmation(`${role === 'ground' ? 'Base' : 'Satélite'} envió ${action.type}. Esperando confirmación…`);
    await store.getState().sendAction(action);
    const after = store.getState();
    if (after.error || !after.snapshot || after.snapshot.revision <= before.revision) {
      setConfirmation('La acción no fue confirmada. Revisa el error del operador.');
      return false;
    }
    setStepIndex(index + 1);
    setConfirmation(`${demoSteps[index].label} confirmada en revisión ${after.snapshot.revision}.`);
    return true;
  }

  async function selectScenario(next: DemoScenario) {
    ++runToken.current;
    const snapshot = groundStore.getState().snapshot;
    if (!snapshot || !bothConnected || busy) return;
    await groundStore.getState().sendAction({
      type: 'RESET_MISSION', actorRole: 'ground', actionId: crypto.randomUUID(),
      expectedRevision: snapshot.revision, payload: {},
    });
    if (groundStore.getState().error) return;
    gateway.faultConfig.forcedQuality = next === 'cloudy' ? 'cloudy' : 'valid';
    setScenario(next);
    setStepIndex(0);
    setConfirmation(next === 'cloudy'
      ? 'Escenario nublado listo. La imagen será simulada y la evidencia, limitada.'
      : 'Escenario rutinario listo. Avanza por las decisiones de ambos operadores.');
  }

  async function playAll() {
    if (!bothConnected || busy || stepIndex >= demoSteps.length) return;
    const token = ++runToken.current;
    setPlaying(true);
    try {
      for (let index = stepIndex; index < demoSteps.length; index += 1) {
        if (token !== runToken.current) break;
        const okay = await advance(index, scenario);
        if (!okay) break;
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
    } finally {
      if (token === runToken.current) setPlaying(false);
    }
  }

  function toggleConnection() {
    if (connection === 'connected') {
      gateway.setConnectionState(roomId, 'disconnected');
      setConfirmation('Enlace interrumpido para la demostración. Los controles quedan en espera.');
    } else {
      gateway.setConnectionState(roomId, 'connected');
      void Promise.all([groundStore.getState().reconnect(), satelliteStore.getState().reconnect()]);
      setConfirmation('Reconectando los dos puestos a la misma sala local…');
    }
  }

  async function showRejectedAction() {
    const snapshot = satelliteStore.getState().snapshot;
    if (!snapshot) return;
    await satelliteStore.getState().sendAction({
      type: 'REQUEST_OBSERVATION', actorRole: 'satellite', actionId: crypto.randomUUID(),
      expectedRevision: snapshot.revision, payload: { targetId: 'rio-piura' },
    });
    setConfirmation('Ejemplo de error: solo Base puede solicitar una observación. No cambió el snapshot.');
  }

  const currentExplanation = stepIndex < demoSteps.length
    ? demoSteps[stepIndex].explanation
    : scenario === 'cloudy'
      ? 'La cobertura de nubes obliga a reportar evidencia insuficiente y pedir nueva observación o verificación de campo.'
      : 'El informe de la demo identifica un posible hallazgo; no constituye una alerta real.';
  const visibleError = lastErrorGround ?? lastErrorSatellite;

  return (
    <main className="demo-page">
      <div className="demo-shell">
        <header className="demo-header">
          <div className="demo-brand"><div className="demo-logo" aria-hidden="true">P<span>·</span>C</div><div><p>NASA SPACE APPS · PROTOTIPO EDUCATIVO</p><h1>PERUSAT CREW</h1></div></div>
          <div className="demo-header-right"><span className="demo-mission-tag">MISIÓN A · INUNDACIONES EN PIURA</span><span className="demo-live-dot">DEMO LOCAL</span></div>
        </header>

        <section className="demo-intro">
          <div><p className="demo-eyebrow">OPERACIÓN EL NIÑO / SALA DE ENTRENAMIENTO</p><h2>Dos decisiones. Una misión compartida.</h2><p>La Base solicita y analiza. El Satélite planifica, captura y transmite. Cada cambio se confirma en ambos puestos.</p></div>
          <div className="demo-disclaimer"><strong>SIMULACIÓN EDUCATIVA</strong><span>Imágenes, recursos y transmisión son didácticos. No son mediciones ni operaciones reales de NASA o PerúSAT-1.</span></div>
        </section>

        <section className="demo-toolbar" aria-label="Controles de demostración">
          <div className="demo-scenarios"><span>SECUENCIA</span><button type="button" className={scenario === 'routine' ? 'selected' : ''} disabled={busy || !bothConnected} onClick={() => void selectScenario('routine')}>Rutinaria</button><button type="button" className={scenario === 'cloudy' ? 'selected' : ''} disabled={busy || !bothConnected} onClick={() => void selectScenario('cloudy')}>Imagen con nubes</button></div>
          <div className="demo-actions"><button type="button" className="demo-button-secondary" disabled={busy || !bothConnected || stepIndex >= demoSteps.length} onClick={() => void advance(stepIndex, scenario)}>Siguiente decisión</button><button type="button" className="demo-button-primary" disabled={busy || !bothConnected || stepIndex >= demoSteps.length} onClick={() => void playAll()}>{playing ? 'Reproduciendo…' : 'Reproducir secuencia'}</button></div>
        </section>

        <section className="demo-progress" aria-label="Progreso de la misión">
          {demoSteps.map((step, index) => <div key={step.label} className={`demo-step ${index < stepIndex ? 'done' : ''} ${index === stepIndex ? 'current' : ''}`}><span className="demo-step-number">{index < stepIndex ? '✓' : index + 1}</span><span>{step.label}</span></div>)}
        </section>

        <section className="demo-panels">
          <Panel role="ground" store={groundStore} stepIndex={stepIndex} />
          <div className="demo-link" aria-hidden="true"><span>↔</span><small>SNAPSHOT<br />CONFIRMADO</small></div>
          <Panel role="satellite" store={satelliteStore} stepIndex={stepIndex} />
        </section>

        <section className="demo-lesson" aria-live="polite"><div className="demo-lesson-icon" aria-hidden="true">i</div><div><strong>Por qué importa esta decisión</strong><p>{currentExplanation}</p><small>{confirmation}</small></div></section>

        <div className="demo-footer-controls"><button type="button" onClick={toggleConnection} disabled={busy}>{connection === 'connected' ? 'Simular pérdida de conexión' : 'Restablecer conexión'}</button><button type="button" onClick={() => void showRejectedAction()} disabled={busy || !bothConnected}>Mostrar acción no permitida</button><span>{visibleError ? `Error visible: ${visibleError.code}` : ground ? `Sala ${ground.roomId} · esquema v${ground.schemaVersion}` : 'Conectando con sala local…'}</span></div>
      </div>
    </main>
  );
}
