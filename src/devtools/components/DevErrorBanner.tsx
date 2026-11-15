import React from 'react';
import type { MissionErrorCode } from '../../core/MissionGateway';

interface DevErrorBannerProps {
  error: {
    code?: MissionErrorCode | string;
    message: string;
    actionType?: string;
  } | null;
  onDismiss: () => void;
}

export const DevErrorBanner: React.FC<DevErrorBannerProps> = ({ error, onDismiss }) => {
  if (!error) return null;

  return (
    <div className="bg-rose-950/80 border border-rose-700/80 rounded-xl p-4 text-rose-100 shadow-lg flex items-start justify-between gap-3 animate-fadeIn">
      <div className="flex items-start gap-3">
        <span className="text-xl">⚠️</span>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-rose-300">
              Error en Acción {error.actionType ? `[${error.actionType}]` : ''}
            </h3>
            {error.code && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-900 border border-rose-800 text-rose-200">
                {error.code}
              </span>
            )}
          </div>
          <p className="text-xs text-rose-200 mt-1 leading-relaxed">
            {error.message}
          </p>
          <div className="text-[10px] text-rose-300/80 mt-1.5 italic">
            Sugerencia didáctica: Revisa los recursos disponibles o el rol autorizado antes de reenviar la acción.
          </div>
        </div>
      </div>

      <button
        onClick={onDismiss}
        className="text-rose-400 hover:text-rose-200 text-xs px-2 py-1 bg-rose-900/50 hover:bg-rose-900 rounded"
      >
        Cerrar
      </button>
    </div>
  );
};
