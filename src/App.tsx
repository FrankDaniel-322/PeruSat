import React, { useEffect, useState } from 'react';
import { IntegrationHarness } from './dev/IntegrationHarness';
import { DevApp } from './devtools/DevApp';
import { PeruSatGameApp } from './game/PeruSatGameApp';

export const App: React.FC = () => {
  const [view, setView] = useState<'game' | 'harness' | 'devtools'>('game');
  const [showDevNav, setShowDevNav] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('dev') === 'true' || params.get('debug') === 'true' || params.get('harness') === 'true') {
        setShowDevNav(true);
        if (params.get('harness') === 'true') setView('harness');
        else if (params.get('dev') === 'true') setView('devtools');
      }

      // Atajo de teclado para evaluadores / jurado técnico: Ctrl + Shift + D
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
          e.preventDefault();
          setShowDevNav((prev) => !prev);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Selector de Entorno Superior: Oculto en vista normal del juego, visible en modo dev/evaluador */}
      {showDevNav && (
        <nav className="bg-slate-950 border-b border-cyan-800/80 px-4 py-1.5 flex items-center justify-between text-xs text-slate-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="font-bold text-cyan-400">PERUSAT CREW</span>
            <span>·</span>
            <span className="text-amber-400 font-bold">Modo Evaluación Técnica / Jurado</span>
          </div>

          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => setView('game')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                view === 'game'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🕹️ Videojuego 2D
            </button>
            <button
              onClick={() => setView('devtools')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                view === 'devtools'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🛠️ DevTools de Integración
            </button>
            <button
              onClick={() => setView('harness')}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                view === 'harness'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ⚙️ Arnés React-Phaser
            </button>
            <button
              onClick={() => setShowDevNav(false)}
              className="px-2 py-1 rounded text-slate-500 hover:text-slate-300 text-xs"
              title="Ocultar barra técnica (reabrir con Ctrl+Shift+D)"
            >
              ✕
            </button>
          </div>
        </nav>
      )}

      {/* Vista Activa */}
      <div className="flex-1">
        {view === 'game' && <PeruSatGameApp />}
        {view === 'devtools' && <DevApp />}
        {view === 'harness' && <IntegrationHarness />}
      </div>
    </div>
  );
};
