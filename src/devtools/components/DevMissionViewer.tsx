import React from 'react';
import type { MissionPhase, MissionSnapshot, Quality } from '../../contracts/mission';
import type { ConnectionState } from '../../core/MissionGateway';

interface DevMissionViewerProps {
  snapshot: MissionSnapshot;
  connectionState: ConnectionState;
}

const PHASES: { id: MissionPhase; label: string }[] = [
  { id: 'briefing', label: '01. Briefing' },
  { id: 'planning', label: '02. Planificación' },
  { id: 'capture', label: '03. Captura' },
  { id: 'downlink', label: '04. Transmisión' },
  { id: 'review', label: '05. Revisión' },
  { id: 'debrief', label: '06. Debriefing' },
];

function qualityBadge(quality: Quality) {
  switch (quality) {
    case 'valid':
      return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-950 text-emerald-400 border border-emerald-800">Óptima (Válida)</span>;
    case 'cloudy':
      return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-950 text-amber-400 border border-amber-800">Nubosidad Parcial</span>;
    case 'corrupt':
      return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-rose-950 text-rose-400 border border-rose-800">Archivo Corrupto</span>;
    case 'incomplete':
      return <span className="px-2 py-0.5 text-xs font-semibold rounded bg-purple-950 text-purple-400 border border-purple-800">Incompleta</span>;
  }
}

export const DevMissionViewer: React.FC<DevMissionViewerProps> = ({
  snapshot,
  connectionState,
}) => {
  const { resources, observations, phase, status, revision, roomId } = snapshot;

  const currentPhaseIndex = PHASES.findIndex((p) => p.id === phase);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-xl space-y-5">
      {/* Cabecera de Telemetría */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-cyan-400">Estado de Misión: flood-piura-01</h2>
            <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-300">
              Rev: {revision}
            </span>
            <span className="text-xs px-2 py-0.5 rounded font-mono bg-cyan-950 text-cyan-300 border border-cyan-800">
              v3 (Master)
            </span>
          </div>
          <p className="text-xs text-slate-400">Sala: {roomId}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Beacon de conexión de red */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                connectionState === 'connected'
                  ? 'bg-emerald-400 animate-pulse'
                  : connectionState === 'reconnecting'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-400'
              }`}
            />
            <span className="font-mono text-slate-300 capitalize">{connectionState}</span>
          </div>

          <span
            className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider ${
              status === 'active'
                ? 'bg-blue-950 text-blue-300 border border-blue-800'
                : status === 'completed'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-rose-950 text-rose-300 border border-rose-800'
            }`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Stepper de Fases */}
      <div>
        <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">
          Fase Operativa Actual
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {PHASES.map((p, idx) => {
            const isCurrent = p.id === phase;
            const isPast = idx < currentPhaseIndex;
            return (
              <div
                key={p.id}
                className={`p-2 rounded text-center text-xs transition-colors border ${
                  isCurrent
                    ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 font-bold shadow-md shadow-cyan-950/50'
                    : isPast
                    ? 'bg-slate-800/60 border-slate-700 text-slate-300'
                    : 'bg-slate-950/40 border-slate-850 text-slate-600'
                }`}
              >
                {p.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* Indicadores de Recursos y Telemetría Simulada */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Telemetría de Recursos (Valores Didácticos)
          </span>
          <span className="text-[10px] text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/60">
            SIMULADO
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Energía Wh */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Batería EPS</span>
              <span className={`font-mono font-bold ${resources.energyWh < 20 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {resources.energyWh} Wh
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full ${resources.energyWh < 20 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                style={{ width: `${Math.min(100, (resources.energyWh / 100) * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Costo captura: 12 Wh</div>
          </div>

          {/* Memoria MB */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Almacenamiento</span>
              <span className={`font-mono font-bold ${resources.storageMb < 15 ? 'text-amber-400' : 'text-cyan-400'}`}>
                {resources.storageMb} MB
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full ${resources.storageMb < 15 ? 'bg-amber-400' : 'bg-cyan-400'}`}
                style={{ width: `${Math.min(100, (resources.storageMb / 70) * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Capacidad libre / 70 MB</div>
          </div>

          {/* Contacto Segundos */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Ventana Enlace</span>
              <span className={`font-mono font-bold ${resources.contactSeconds < 30 ? 'text-rose-400' : 'text-blue-400'}`}>
                {resources.contactSeconds} s
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full ${resources.contactSeconds < 30 ? 'bg-rose-400' : 'bg-blue-400'}`}
                style={{ width: `${Math.min(100, (resources.contactSeconds / 80) * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Pase sobre CNOIS (4 Mb/s)</div>
          </div>

          {/* Créditos */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Presupuesto</span>
              <span className="font-mono font-bold text-slate-200">{resources.budgetCredits} cr</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-400"
                style={{ width: `${Math.min(100, (resources.budgetCredits / 100) * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Coste operacional</div>
          </div>

          {/* Masa Satelital */}
          <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Masa PerúSAT-1</span>
              <span className="font-mono font-bold text-slate-300">{resources.massKg} kg</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-2">Informativa referencial</div>
          </div>
        </div>
      </div>

      {/* Lista de Observaciones / Bandeja de Imágenes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Observaciones Satelitales ({observations.length})
          </span>
          <span className="text-xs text-slate-400">
            Seleccionada: <strong className="text-cyan-300">{snapshot.selectedTargetId || 'Ninguna'}</strong>
          </span>
        </div>

        {observations.length === 0 ? (
          <div className="p-4 rounded-lg bg-slate-950/40 border border-dashed border-slate-800 text-center text-xs text-slate-500">
            No se han registrado capturas aún. Satélite debe ejecutar `CAPTURE_IMAGE` en fase de captura.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {observations.map((obs) => (
              <div
                key={obs.observationId}
                className={`p-3 rounded-lg border transition-all ${
                  obs.transmitted
                    ? 'bg-slate-950/80 border-slate-700'
                    : 'bg-slate-950/40 border-amber-900/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <span className="font-mono font-bold text-sm text-cyan-300">{obs.observationId}</span>
                    <span className="text-xs text-slate-400 ml-2">Zona: {obs.targetId}</span>
                  </div>
                  {qualityBadge(obs.quality)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300 mb-2">
                  <div>Tamaño: <strong className="text-slate-100">{obs.sizeMb} MB</strong></div>
                  <div>Origen: <strong className="text-slate-100">{obs.sourceProvider}</strong></div>
                  <div className="col-span-2 text-[11px] text-slate-400 font-mono">
                    UTC: {obs.capturedAtUtc}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        obs.transmitted ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    <span className={obs.transmitted ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                      {obs.transmitted ? 'Transmitida a CNOIS' : 'En memoria del Satélite'}
                    </span>
                  </div>

                  <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                    SIMULADA
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
