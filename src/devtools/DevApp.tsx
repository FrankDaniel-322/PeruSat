import React, { useMemo, useState } from 'react';
import type { PlayerRole } from '../contracts/mission';
import { DevMissionGateway } from './DevMissionGateway';
import { useMissionGateway } from './devState';
import { DevControlsPanel } from './components/DevControlsPanel';
import { DevErrorBanner } from './components/DevErrorBanner';
import { DevEventsLog } from './components/DevEventsLog';
import { DevMissionViewer } from './components/DevMissionViewer';

interface DevAppProps {
  customGateway?: DevMissionGateway;
  defaultRoomId?: string;
}

export const DevApp: React.FC<DevAppProps> = ({
  customGateway,
  defaultRoomId = 'sala-dev-piura',
}) => {
  const [roomId] = useState(defaultRoomId);
  const [activeRole, setActiveRole] = useState<PlayerRole>('ground');
  const [viewMode, setViewMode] = useState<'single' | 'dual'>('single');

  // Gateway compartido para la sesión de devtools
  const gateway = useMemo(() => customGateway ?? new DevMissionGateway(), [customGateway]);

  const {
    snapshot,
    connectionState,
    logs,
    lastError,
    recordActionLog,
    clearLogs,
    dismissError,
  } = useMissionGateway(gateway, roomId);

  // Escenarios preconfigurados para demostración rápida
  const runScenarioA1 = async () => {
    try {
      // 1. Reset
      await gateway.dispatch(roomId, {
        actionId: crypto.randomUUID(),
        actorRole: 'ground',
        expectedRevision: snapshot.revision,
        type: 'RESET_MISSION',
        payload: {},
      });
      // 2. Request observation
      const s1 = await gateway.getSnapshot(roomId);
      await gateway.dispatch(roomId, {
        actionId: crypto.randomUUID(),
        actorRole: 'ground',
        expectedRevision: s1.revision,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      });
      // 3. Approve plan
      const s2 = await gateway.getSnapshot(roomId);
      await gateway.dispatch(roomId, {
        actionId: crypto.randomUUID(),
        actorRole: 'satellite',
        expectedRevision: s2.revision,
        type: 'APPROVE_PLAN',
        payload: { profileId: 'optico-submetrico' },
      });
      // 4. Capture valid image
      gateway.faultConfig.forcedQuality = 'valid';
      const s3 = await gateway.getSnapshot(roomId);
      await gateway.dispatch(roomId, {
        actionId: crypto.randomUUID(),
        actorRole: 'satellite',
        expectedRevision: s3.revision,
        type: 'CAPTURE_IMAGE',
        payload: { targetId: 'rio-piura' },
      });
    } catch (err: unknown) {
      console.error('Error al ejecutar Escenario A1:', err);
    }
  };

  const runScenarioA2 = async () => {
    try {
      // 1. Reset
      await gateway.dispatch(roomId, {
        actionId: crypto.randomUUID(),
        actorRole: 'ground',
        expectedRevision: snapshot.revision,
        type: 'RESET_MISSION',
        payload: {},
      });
      // 2. Request observation
      const s1 = await gateway.getSnapshot(roomId);
      await gateway.dispatch(roomId, {
        actionId: crypto.randomUUID(),
        actorRole: 'ground',
        expectedRevision: s1.revision,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: 'rio-piura' },
      });
      // 3. Approve plan
      const s2 = await gateway.getSnapshot(roomId);
      await gateway.dispatch(roomId, {
        actionId: crypto.randomUUID(),
        actorRole: 'satellite',
        expectedRevision: s2.revision,
        type: 'APPROVE_PLAN',
        payload: { profileId: 'optico-submetrico' },
      });
      // 4. Capture CLOUDY image (incidente)
      gateway.faultConfig.forcedQuality = 'cloudy';
      const s3 = await gateway.getSnapshot(roomId);
      await gateway.dispatch(roomId, {
        actionId: crypto.randomUUID(),
        actorRole: 'satellite',
        expectedRevision: s3.revision,
        type: 'CAPTURE_IMAGE',
        payload: { targetId: 'rio-piura' },
      });
    } catch (err: unknown) {
      console.error('Error al ejecutar Escenario A2:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 font-sans">
      {/* Banner Superior de DevTools */}
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🛰️</span>
              <h1 className="text-lg md:text-xl font-black text-cyan-400 tracking-tight">
                PERUSAT CREW · Consola de Integración y Pruebas (DevTools)
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Entorno de verificación para Rol 01 · Misión A (Inundaciones en Piura) · schemaVersion: 3
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Botones de Escenarios Rápidos */}
            <button
              onClick={runScenarioA1}
              className="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 text-xs font-semibold rounded border border-emerald-800"
            >
              ▶ Auto-Paso A1 (Rutinario)
            </button>
            <button
              onClick={runScenarioA2}
              className="px-3 py-1.5 bg-amber-950 hover:bg-amber-900 text-amber-300 text-xs font-semibold rounded border border-amber-800"
            >
              ⚡ Incidente A2 (Nubosidad)
            </button>

            {/* Alternador de Modo de Vista */}
            <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setViewMode('single')}
                className={`px-2.5 py-1 rounded font-medium ${
                  viewMode === 'single' ? 'bg-cyan-600 text-white' : 'text-slate-400'
                }`}
              >
                Consola Única
              </button>
              <button
                onClick={() => setViewMode('dual')}
                className={`px-2.5 py-1 rounded font-medium ${
                  viewMode === 'dual' ? 'bg-cyan-600 text-white' : 'text-slate-400'
                }`}
              >
                Vista Dual (Base + Satélite)
              </button>
            </div>
          </div>
        </header>

        {/* Notificación de Errores */}
        <DevErrorBanner error={lastError} onDismiss={dismissError} />

        {/* Visualizador de Telemetría y Estado de Misión */}
        <DevMissionViewer snapshot={snapshot} connectionState={connectionState} />

        {/* Panel de Controles: Modo Único o Vista Dual */}
        {viewMode === 'single' ? (
          <DevControlsPanel
            activeRole={activeRole}
            onRoleChange={setActiveRole}
            snapshot={snapshot}
            gateway={gateway}
            onActionDispatched={recordActionLog}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border-t-2 border-cyan-500 pt-1">
              <DevControlsPanel
                activeRole="ground"
                onRoleChange={() => {}}
                snapshot={snapshot}
                gateway={gateway}
                onActionDispatched={recordActionLog}
              />
            </div>
            <div className="border-t-2 border-indigo-500 pt-1">
              <DevControlsPanel
                activeRole="satellite"
                onRoleChange={() => {}}
                snapshot={snapshot}
                gateway={gateway}
                onActionDispatched={recordActionLog}
              />
            </div>
          </div>
        )}

        {/* Registro y Auditoría de Eventos */}
        <DevEventsLog logs={logs} onClear={clearLogs} />

        {/* Pie de Página Ético e Informativo */}
        <footer className="text-center text-[11px] text-slate-500 py-4 border-t border-slate-900">
          <p>
            <strong>Aviso de Simulación:</strong> Prototipo didáctico desarrollado para NASA Space Apps Challenge 2026.
            Los valores de batería, almacenamiento y ventanas de paso son pedagógicos y no reflejan telemetría de vuelo del satélite PerúSAT-1.
            Ningún componente envía alertas reales a autoridades de protección civil.
          </p>
        </footer>
      </div>
    </div>
  );
};
