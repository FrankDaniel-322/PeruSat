import React, { useState } from 'react';
import type { PlayerRole } from '../../contracts/mission';
import { soundManager } from '../audio/SoundManager';

interface MainMenuProps {
  onStartLocalMission: (role: PlayerRole, scenario: 'routine' | 'emergency') => void;
  onOpenMultiplayer: () => void;
  onOpenBriefing: () => void;
  onOpenExplorableWorld?: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  onStartLocalMission,
  onOpenMultiplayer,
  onOpenBriefing,
  onOpenExplorableWorld,
}) => {
  const [selectedRole, setSelectedRole] = useState<PlayerRole>('ground');
  const [selectedScenario, setSelectedScenario] = useState<'routine' | 'emergency'>('routine');

  const handleStartGame = () => {
    soundManager.playClick();
    onStartLocalMission(selectedRole, selectedScenario);
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 py-4 px-2">
      {/* Portada Vintage Pixel Art */}
      <div className="relative rounded-xl border-2 border-cyan-500/80 bg-slate-950 overflow-hidden shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 border-b border-cyan-800/80">
          <div>
            <h1 className="text-base sm:text-xl font-black tracking-tight text-slate-100 font-mono">
              PERUSAT CREW <span className="text-cyan-400">· Operación El Niño</span>
            </h1>
            <p className="text-xs text-amber-400 font-mono font-bold tracking-wide">
              NASA SPACE APPS CHALLENGE 2026 · SIMULADOR AEROESPACIAL
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
              CONIDA · CNOIS
            </span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
              NASA IMERG V07
            </span>
          </div>
        </div>

        {/* Imagen de Portada Pixel Art Original */}
        <div className="relative aspect-video max-h-[380px] w-full bg-slate-950 flex items-center justify-center overflow-hidden">
          <img
            src="/assets/portada.png"
            alt="PERUSAT CREW · Operación El Niño. Los dos operadores y el gato en la cabina de mando espacial."
            className="w-full h-full object-contain pixelated"
            style={{ imageRendering: 'pixelated' }}
          />
          {/* Sutil overlay gradiente inferior */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent pointer-events-none" />
        </div>

        {/* Barra de Acciones Rápidas */}
        <div className="p-4 bg-slate-900/95 border-t border-cyan-900/60 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-slate-300 font-mono max-w-xl leading-relaxed">
            Monitoreo satelital coordinado ante emergencias por inundación en Piura. Colabora entre la{' '}
            <strong className="text-cyan-400">Base Terrena CNOIS</strong> (Punta Hermosa) y el satélite de observación{' '}
            <strong className="text-amber-400">PerúSAT-1</strong>.
          </div>
          <button
            onClick={handleStartGame}
            className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-black text-sm rounded-lg shadow-lg hover:shadow-cyan-500/30 transition-all transform active:scale-95 flex items-center gap-2"
          >
            <span>🚀 Iniciar Misión Directa</span>
            <span>→</span>
          </button>
        </div>
      </div>

      {/* Paneles de Configuración y Modos de Juego */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono">
        {/* Panel Modo Local / Configuración */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-4 shadow-xl">
          <div className="border-b border-slate-800 pb-2">
            <div className="text-xs text-cyan-400 font-bold uppercase tracking-wider">Modo en Solitario / Local</div>
            <h2 className="text-base font-bold text-slate-100">Configuración de Operación</h2>
            <p className="text-xs text-slate-400">Juega ambos puestos alternando roles o practica tu primera misión.</p>
          </div>

          {/* Selector de Rol Inicial */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-300 font-bold block">1. Tu Puesto de Operaciones Inicial:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  setSelectedRole('ground');
                }}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  selectedRole === 'ground'
                    ? 'bg-cyan-950 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-950/50'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <span>📡</span>
                  <span>Base CNOIS</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  Operadora en tierra. Elige cuencas, autoriza telemetría y emite el dictamen oficial.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  setSelectedRole('satellite');
                }}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  selectedRole === 'satellite'
                    ? 'bg-amber-950 border-amber-400 text-amber-200 shadow-md shadow-amber-950/50'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <span>🛰️</span>
                  <span>PerúSAT-1</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  Operador en órbita. Configura resolución, calibra cámara NAOMI y transmite por Banda X.
                </p>
              </button>
            </div>
          </div>

          {/* Selector de Escenario */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-300 font-bold block">2. Escenario de la Misión A:</label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  setSelectedScenario('routine');
                }}
                className={`w-full p-2.5 rounded-lg border text-left transition-all ${
                  selectedScenario === 'routine'
                    ? 'bg-blue-950/80 border-cyan-400 text-cyan-200 shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex justify-between items-center font-bold text-xs">
                  <span>A1 · Práctica Rutinaria</span>
                  <span className="text-[11px] text-emerald-400">Meta: 2 Cuencas</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  Condiciones ópticas favorables. Requiere corroborar dos observaciones válidas (Río Piura y Río Chira) antes del informe.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  setSelectedScenario('emergency');
                }}
                className={`w-full p-2.5 rounded-lg border text-left transition-all ${
                  selectedScenario === 'emergency'
                    ? 'bg-amber-950/80 border-amber-400 text-amber-200 shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex justify-between items-center font-bold text-xs">
                  <span>A2 · Alerta por Crecida y Lluvias</span>
                  <span className="text-[11px] text-amber-400">Emergencia / Nubes</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  Datos NASA IMERG estiman 42.5 mm/h. El sensor óptico enfrenta nubosidad densa. Debes aplicar rigor científico ante evidencia insuficiente.
                </p>
              </button>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleStartGame}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg shadow transition-colors flex items-center justify-center gap-2"
            >
              <span>🎮 Entrar a la Cabina de Mando</span>
              <span>→</span>
            </button>
          </div>
        </div>

        {/* Panel Modos Adicionales: Multijugador, Briefing, Exploración */}
        <div className="space-y-4">
          {/* Card Multijugador Supabase */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-amber-400 font-bold uppercase tracking-wider">Modo Cooperativo</div>
                <h3 className="text-base font-bold text-slate-100">Multijugador en Tiempo Real</h3>
              </div>
              <span className="text-2xl">🌐</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Juega con dos operadores reales conectados mediante Supabase Realtime y Edge Functions. Un jugador en Base CNOIS y otro en el Satélite.
            </p>
            <button
              onClick={() => {
                soundManager.playClick();
                onOpenMultiplayer();
              }}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-cyan-400 text-cyan-300 font-bold text-xs rounded-lg shadow transition-all flex items-center justify-center gap-2"
            >
              <span>🌐 Crear o Unirse a Sala (Código)</span>
              <span>→</span>
            </button>
          </div>

          {/* Card Mundo Explorable 2D (Phaser 4) */}
          {onOpenExplorableWorld && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-emerald-400 font-bold uppercase tracking-wider">Mundo 2D Phaser 4</div>
                  <h3 className="text-base font-bold text-slate-100">Exploración de la Estación</h3>
                </div>
                <span className="text-2xl">🚶</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Controla a tu astronauta con WASD y flechas. Camina entre el Centro CNOIS y la Sala de Carga Útil, acércate a las consolas y pulsa [E] para operar.
              </p>
              <button
                onClick={() => {
                  soundManager.playClick();
                  onOpenExplorableWorld();
                }}
                className="w-full py-2.5 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600 text-emerald-300 font-bold text-xs rounded-lg shadow transition-all flex items-center justify-center gap-2"
              >
                <span>🚶 Entrar en Modo Explorable 2D [WASD]</span>
                <span>→</span>
              </button>
            </div>
          )}

          {/* Card Briefing Científico NASA IMERG */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-400 font-bold uppercase tracking-wider">Ciencia Satelital</div>
                <h3 className="text-base font-bold text-slate-100">Briefing y Datos NASA IMERG</h3>
              </div>
              <span className="text-2xl">🗺️</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Consulta la justificación ética y técnica: tasas de precipitación satelital, limitaciones de la cámara óptica y balance de enlace a 4 Mb/s.
            </p>
            <button
              onClick={() => {
                soundManager.playClick();
                onOpenBriefing();
              }}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs rounded-lg shadow transition-colors flex items-center justify-center gap-2"
            >
              <span>🗺️ Consultar Briefing Científico</span>
              <span>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
