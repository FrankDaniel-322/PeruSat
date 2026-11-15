import React, { useState } from 'react';
import type { DevActionLogItem } from '../types';

interface DevEventsLogProps {
  logs: DevActionLogItem[];
  onClear: () => void;
}

export const DevEventsLog: React.FC<DevEventsLogProps> = ({ logs, onClear }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-xl space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-cyan-400">Registro de Eventos y Auditoría</h2>
          <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-800 text-slate-300">
            {logs.length} eventos
          </span>
        </div>
        <button
          onClick={onClear}
          className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
        >
          Limpiar Log
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="p-4 rounded bg-slate-950/40 border border-dashed border-slate-800 text-center text-xs text-slate-500">
          No hay eventos registrados. Ejecuta una acción desde el panel de controles.
        </div>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {logs.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <div
                key={item.id}
                className={`p-2.5 rounded text-xs border transition-all ${
                  item.status === 'success'
                    ? 'bg-slate-950/70 border-slate-800'
                    : 'bg-rose-950/30 border-rose-900/60'
                }`}
              >
                <div
                  className="flex items-center justify-between gap-2 cursor-pointer select-none"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        item.status === 'success' ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                    />
                    <span className="font-mono text-cyan-300 font-semibold">
                      {item.actionType}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {item.actorRole}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-400 text-[11px] font-mono">
                    {item.snapshotRevision !== undefined && (
                      <span>Rev: {item.snapshotRevision}</span>
                    )}
                    <span>{item.timestamp}</span>
                    <span>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {item.status === 'error' && item.errorMessage && (
                  <div className="mt-2 text-rose-300 bg-rose-950/50 p-2 rounded border border-rose-900 text-[11px]">
                    <strong>{item.errorCode || 'ERROR'}:</strong> {item.errorMessage}
                  </div>
                )}

                {isExpanded && item.payload !== undefined && (
                  <div className="mt-2 pt-2 border-t border-slate-800/80">
                    <div className="text-[10px] text-slate-400 mb-1 font-mono">Detalle del Payload:</div>
                    <pre className="bg-black/50 p-2 rounded text-[10px] text-emerald-400 font-mono overflow-x-auto">
                      {JSON.stringify(item.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
