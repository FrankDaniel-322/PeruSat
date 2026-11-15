import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { PlayerRole } from '../contracts/mission';
import { MockMissionGateway, MockMissionHub } from '../core/MockMissionGateway';
import { missionBridge } from '../integration/missionBridge';
import { PhaserGame } from '../integration/PhaserGame';
import { createMissionStore, type MissionStore } from '../store/missionStore';

// Two independent client stores, one shared in-memory gateway hub.
const hub = new MockMissionHub();
const groundStore = createMissionStore(new MockMissionGateway(hub));
const satelliteStore = createMissionStore(new MockMissionGateway(hub));
const roomId = 'local-demo';

function ClientReadout({ role, store }: { role: PlayerRole; store: MissionStore }) {
  const snapshot = useStore(store, (state) => state.snapshot);
  const connection = useStore(store, (state) => state.connection);
  const error = useStore(store, (state) => state.error);
  return (
    <section className="rounded border border-slate-600 p-4" aria-label={`Cliente ${role}`}>
      <h2 className="font-semibold">{role}</h2>
      <p>Conexión: {connection}</p>
      <p>Fase: {snapshot?.phase ?? '—'} · Revisión: {snapshot?.revision ?? '—'}</p>
      <p>Objetivo: {snapshot?.selectedTargetId ?? '—'}</p>
      {error && <p className="text-red-300" role="alert">{error.code}: {error.message}</p>}
    </section>
  );
}

export function IntegrationHarness() {
  const [targetId, setTargetId] = useState('piura');
  const ground = useStore(groundStore, (state) => state.snapshot);
  const pending = useStore(groundStore, (state) => state.pending);

  useEffect(() => {
    void groundStore.getState().connect(roomId);
    void satelliteStore.getState().connect(roomId);
    const unsubscribeBridge = missionBridge.onPhaserInteraction((interaction) => {
      if (interaction.kind === 'targetSelected') setTargetId(interaction.targetId);
    });
    return () => {
      unsubscribeBridge();
      groundStore.getState().resetUi();
      satelliteStore.getState().resetUi();
    };
  }, []);

  const requestObservation = () => {
    if (!ground) return;
    void groundStore.getState().sendAction({
      type: 'REQUEST_OBSERVATION',
      actionId: crypto.randomUUID(),
      actorRole: 'ground',
      expectedRevision: ground.revision,
      payload: { targetId },
    });
  };

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6 text-slate-100">
      <header>
        <h1 className="text-2xl font-bold">PERUSAT CREW · Integración v3</h1>
        <p className="text-slate-300">Demostración local de comunicación; no representa multijugador remoto.</p>
      </header>
      <PhaserGame />
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="target">Objetivo</label>
        <input id="target" className="rounded bg-slate-700 px-2 py-1" value={targetId}
          onChange={(event) => setTargetId(event.target.value)} />
        <button className="rounded bg-cyan-700 px-3 py-1 disabled:opacity-50"
          onClick={() => missionBridge.requestGameInteraction({ kind: 'focusTarget', targetId })}>
          Enfocar en Phaser
        </button>
        <button className="rounded bg-emerald-700 px-3 py-1 disabled:opacity-50"
          disabled={!ground || pending || !targetId.trim() || ground.phase !== 'briefing'}
          onClick={requestObservation}>
          Solicitar observación
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ClientReadout role="ground" store={groundStore} />
        <ClientReadout role="satellite" store={satelliteStore} />
      </div>
    </main>
  );
}
