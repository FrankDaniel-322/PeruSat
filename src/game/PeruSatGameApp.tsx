import React, { useMemo, useState } from 'react';
import type { Finding, PlayerRole } from '../contracts/mission';
import { DevMissionGateway } from '../devtools/DevMissionGateway';
import { useMissionGateway } from '../devtools/devState';
import { soundManager } from './audio/SoundManager';
import { FinalMissionReport } from './report/FinalMissionReport';
import { StationCanvas } from './station/StationCanvas';

export const PeruSatGameApp: React.FC = () => {
  const [role, setRole] = useState<PlayerRole>('ground');
  const [scenarioMode, setScenarioMode] = useState<'routine' | 'emergency'>('routine');
  const [activeTab, setActiveTab] = useState<'game' | 'report' | 'briefing'>('game');
  const [soundMuted, setSoundMuted] = useState(false);
  const roomId = 'mision-piura-01';

  // Gateway compartido para la sesión
  const gateway = useMemo(() => {
    const gw = new DevMissionGateway();
    return gw;
  }, []);

  const { snapshot, connectionState } = useMissionGateway(gateway, roomId);

  // Música y audio al primer clic
  const handleUserInteraction = () => {
    soundManager.startAmbientMusic();
  };

  const toggleSound = () => {
    const isMute = soundManager.toggleMute();
    setSoundMuted(isMute);
  };

  const handleResetMission = async () => {
    soundManager.playClick();
    await gateway.dispatch(roomId, {
      actionId: crypto.randomUUID(),
      actorRole: role,
      expectedRevision: snapshot.revision,
      type: 'RESET_MISSION',
      payload: {},
    });
    setActiveTab('game');
  };

  const currentFinding: Finding = (snapshot.observations[0]?.quality === 'cloudy' || scenarioMode === 'emergency')
    ? 'insufficient'
    : 'possible_flood';

  return (
    <div
      onClick={handleUserInteraction}
      className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950"
    >
      {/* Barra de Navegación Superior */}
      <header className="bg-slate-900 border-b border-cyan-900/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛰️</span>
            <div>
              <h1 className="text-sm md:text-base font-black tracking-tight text-cyan-400">
                PERUSAT CREW · Operación El Niño
              </h1>
              <p className="text-[10px] text-slate-400 font-mono">
                Simulador Cooperativo · Misión A (Inundaciones en Piura)
              </p>
            </div>
          </div>

          <span className="hidden sm:inline-block text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded">
            schemaVersion: 3
          </span>
        </div>

        {/* Pestañas de Vista */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => {
              soundManager.playClick();
              setActiveTab('game');
            }}
            className={`px-3 py-1 rounded transition-colors ${
              activeTab === 'game' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🕹️ Estación 2D
          </button>
          <button
            onClick={() => {
              soundManager.playClick();
              setActiveTab('briefing');
            }}
            className={`px-3 py-1 rounded transition-colors ${
              activeTab === 'briefing' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🗺️ Briefing NASA
          </button>
          <button
            onClick={() => {
              soundManager.playClick();
              setActiveTab('report');
            }}
            className={`px-3 py-1 rounded transition-colors ${
              activeTab === 'report' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            📄 Informe Situación
          </button>
        </div>

        {/* Selector de Rol y Escenario */}
        <div className="flex items-center gap-2 text-xs">
          {/* Conmutador de Rol */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => {
                soundManager.playClick();
                setRole('ground');
              }}
              className={`px-2 py-1 rounded font-bold ${
                role === 'ground' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400'
              }`}
            >
              Base CNOIS
            </button>
            <button
              onClick={() => {
                soundManager.playClick();
                setRole('satellite');
              }}
              className={`px-2 py-1 rounded font-bold ${
                role === 'satellite' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
              }`}
            >
              PerúSAT-1
            </button>
          </div>

          {/* Selector de Escenario */}
          <select
            value={scenarioMode}
            onChange={(e) => {
              soundManager.playClick();
              setScenarioMode(e.target.value as 'routine' | 'emergency');
            }}
            className="bg-slate-950 text-slate-300 border border-slate-700 rounded px-2 py-1 text-xs"
          >
            <option value="routine">A1 · Rutinaria</option>
            <option value="emergency">A2 · Lluvias / Nubes</option>
          </select>

          {/* Audio Mute */}
          <button
            onClick={toggleSound}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
            title={soundMuted ? 'Activar sonido' : 'Silenciar sonido'}
          >
            {soundMuted ? '🔇' : '🔊'}
          </button>

          {/* Estado de Enlace / Conexión */}
          <div className="hidden lg:flex items-center gap-1.5 font-mono text-[10px] text-slate-400 bg-slate-950 px-2 py-1 rounded border border-slate-800">
            <span className={`w-1.5 h-1.5 rounded-full ${connectionState === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{connectionState}</span>
          </div>
        </div>
      </header>

      {/* Contenido Principal según Pestaña */}
      <main className="max-w-5xl mx-auto p-3 md:p-4 space-y-4">
        {activeTab === 'game' && (
          <StationCanvas
            snapshot={snapshot}
            role={role}
            gateway={gateway}
            scenarioMode={scenarioMode}
          />
        )}

        {activeTab === 'briefing' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-xl space-y-5">
            <div className="border-b border-slate-800 pb-3">
              <div className="text-xs text-cyan-400 font-bold uppercase tracking-wider">
                Misión A · Operación El Niño
              </div>
              <h2 className="text-xl font-bold mt-1">Briefing Científico y Operativo</h2>
              <p className="text-xs text-slate-400 mt-1">
                Monitoreo satelital de emergencia ante crecidas fluviales en Piura.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-300">
              <div className="space-y-3">
                <h3 className="font-bold text-cyan-300 text-sm">Objetivo de la Misión</h3>
                <p className="leading-relaxed">
                  Las lluvias torrenciales asociadas al fenómeno de El Niño generan alto riesgo de desborde en las cuencas de los ríos Piura y Chira.
                  Los operadores de la estación deben coordinar la solicitud de observaciones, optimizar el consumo de batería y ventana de antena, y transmitir imágenes ópticas para alimentar el informe de situación.
                </p>

                <h3 className="font-bold text-cyan-300 text-sm mt-4">Compensaciones de Ingeniería</h3>
                <ul className="list-disc list-inside space-y-1.5 leading-relaxed">
                  <li><strong>Resolución vs. Tiempo de Bajada:</strong> Un archivo detallado de 28 MB consume 56 segundos de la ventana de 80s a 4 Mb/s.</li>
                  <li><strong>Límites del Sensor Óptico:</strong> Si hay nubosidad activa, la cámara NAOMI no puede penetrar la capa de nubes; el rigor científico prohíbe inventar certeza.</li>
                </ul>
              </div>

              <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h3 className="font-bold text-amber-400 text-sm">Datos NASA GPM/IMERG V07</h3>
                <p className="leading-relaxed">
                  Producto de precipitación satelital de referencia: tasa estimada de <strong>42.5 mm/h</strong> sobre el norte peruano.
                </p>
                <div className="p-2.5 rounded bg-amber-950/30 border border-amber-900/50 text-[11px] text-amber-200">
                  ⚠️ <strong>Aviso Ético:</strong> La estimación de lluvia satelital no certifica inundación en tierra. La imagen óptica y el reporte en terreno son indispensables para corroborar.
                </div>
                <div className="pt-2 text-[11px] text-cyan-400">
                  <a
                    href="https://gpm.nasa.gov/data/imerg"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline flex items-center gap-1"
                  >
                    ↗ Consultar repositorio oficial NASA GPM/IMERG
                  </a>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActiveTab('game')}
                className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 font-bold text-xs rounded text-white"
              >
                Ir a la Estación de Mando →
              </button>
            </div>
          </div>
        )}

        {activeTab === 'report' && (
          <FinalMissionReport
            snapshot={snapshot}
            finding={currentFinding}
            onReset={handleResetMission}
            onClose={() => setActiveTab('game')}
          />
        )}
      </main>

      {/* Pie de Página Ético e Informativo */}
      <footer className="border-t border-slate-900 py-6 px-4 text-center text-xs text-slate-500 space-y-1">
        <p>
          <strong>PERUSAT CREW: Operación El Niño</strong> · Desarrollado para NASA Space Apps Challenge 2026.
        </p>
        <p className="text-[11px]">
          Simulación didáctica basada en referencias de CONIDA / PerúSAT-1 y NASA GPM/IMERG. No constituye un servicio real de alerta temprana.
        </p>
      </footer>
    </div>
  );
};
