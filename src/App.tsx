import React, { useState } from 'react';
import { IntegrationHarness } from './dev/IntegrationHarness';
import { DevApp } from './devtools/DevApp';
import { PeruSatGameApp } from './game/PeruSatGameApp';

export const App: React.FC = () => {
  const [view, setView] = useState<'game' | 'harness' | 'devtools'>('game');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Selector de Entorno Superior para Evaluación y Jurado */}
      <nav className="bg-slate-950 border-b border-slate-800 px-4 py-1.5 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-bold text-cyan-400">PERUSAT CREW</span>
          <span>·</span>
          <span>NASA Space Apps 2026</span>
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
            🕹️ Videojuego 2D (Among Us CNOIS)
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
            ⚙️ Arnés Técnico React-Phaser
          </button>
        </div>
      </nav>

      {/* Vista Activa */}
      <div className="flex-1">
        {view === 'game' && <PeruSatGameApp />}
        {view === 'devtools' && <DevApp />}
        {view === 'harness' && <IntegrationHarness />}
      </div>
    </div>
  );
};
