import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { Finding, PlayerRole } from '../contracts/mission';
import type { ConnectionState } from '../core/MissionGateway';
import { DevMissionGateway } from '../devtools/DevMissionGateway';
import type { FloodSnapshot } from '../missions/flood/types';
import { createMissionStore } from '../store/missionStore';
import { getSupabaseClient } from '../supabase/supabaseClient';
import { SupabaseMissionGateway } from '../supabase/SupabaseMissionGateway';
import { soundManager } from './audio/SoundManager';
import { RoomLobbyModal } from './lobby/RoomLobbyModal';
import { MainMenu } from './menu/MainMenu';
import { FinalMissionReport } from './report/FinalMissionReport';
import { StationCanvas } from './station/StationCanvas';

const SESSION_KEY = 'perusat_crew_session_v1';

const connectionNames: Record<ConnectionState, string> = {
  disconnected: 'Sin conexión',
  connecting: 'Conectando',
  connected: 'Conectado',
  reconnecting: 'Reconectando',
};

export const PeruSatGameApp: React.FC = () => {
  const [role, setRole] = useState<PlayerRole>('ground');
  const [scenarioMode, setScenarioMode] = useState<'routine' | 'emergency'>('routine');
  const [activeTab, setActiveTab] = useState<'menu' | 'game' | 'report' | 'briefing'>('menu');
  const [initialSceneMode, setInitialSceneMode] = useState<'cabin' | 'explorable'>('cabin');
  const [soundMuted, setSoundMuted] = useState(false);

  // Estado Multijugador / Salas
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState('mision-piura-01');
  const [roomJoinCode, setRoomJoinCode] = useState<string | null>(null);
  const [authenticatedRole, setAuthenticatedRole] = useState<PlayerRole | null>(null);
  const [isLobbyOpen, setIsLobbyOpen] = useState(false);
  const [customCredentials, setCustomCredentials] = useState<{ url: string; anonKey: string } | null>(null);

  // Instancias de Gateways
  const devGateway = useMemo(() => new DevMissionGateway(), []);

  const supabaseGateway = useMemo(() => {
    const client = customCredentials
      ? getSupabaseClient(customCredentials.url, customCredentials.anonKey)
      : getSupabaseClient();
    return client ? new SupabaseMissionGateway(client) : null;
  }, [customCredentials]);

  const activeGateway = isMultiplayer && supabaseGateway ? supabaseGateway : devGateway;

  // Store canónico de misión (Zustand canónico del Rol 01)
  const store = useMemo(() => createMissionStore(activeGateway), [activeGateway]);

  useEffect(() => {
    void store.getState().connect(currentRoomId);
    return () => {
      store.getState().resetUi();
    };
  }, [store, currentRoomId]);

  const snapshot = useStore(store, (s) => s.snapshot);
  const connectionState = useStore(store, (s) => s.connection);
  const storeError = useStore(store, (s) => s.error);

  // Recuperar sesión multijugador guardada al recargar el navegador
  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw || !supabaseGateway) return;
    try {
      const saved = JSON.parse(raw);
      if (saved && saved.roomId && saved.role) {
        supabaseGateway
          .getRoomMembership(saved.roomId)
          .then((member) => {
            if (member && member.role === saved.role) {
              setIsMultiplayer(true);
              setCurrentRoomId(saved.roomId);
              setAuthenticatedRole(member.role);
              setRole(member.role);
              setRoomJoinCode(saved.joinCode || member.joinCode);
            } else {
              localStorage.removeItem(SESSION_KEY);
            }
          })
          .catch(() => {
            localStorage.removeItem(SESSION_KEY);
          });
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [supabaseGateway]);

  // Música y audio al primer clic
  const handleUserInteraction = () => {
    soundManager.startAmbientMusic();
  };

  const toggleSound = () => {
    const isMute = soundManager.toggleMute();
    setSoundMuted(isMute);
  };

  const handleRoleSelect = (selectedRole: PlayerRole) => {
    soundManager.playClick();
    if (isMultiplayer && authenticatedRole) {
      // En multijugador el rol proviene exclusivamente de la sala de Supabase
      return;
    }
    setRole(selectedRole);
  };

  const handleResetMission = async () => {
    if (!snapshot) return;
    soundManager.playClick();
    await activeGateway.dispatch(currentRoomId, {
      actionId: crypto.randomUUID(),
      actorRole: role,
      expectedRevision: snapshot.revision,
      type: 'RESET_MISSION',
      payload: { scenarioId: scenarioMode === 'emergency' ? 'A2' : 'A1' },
    });
    setActiveTab('game');
  };

  const handleRoomJoined = (roomId: string, assignedRole: PlayerRole, joinCode: string) => {
    setIsMultiplayer(true);
    setCurrentRoomId(roomId);
    setAuthenticatedRole(assignedRole);
    setRole(assignedRole);
    setRoomJoinCode(joinCode);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ roomId, role: assignedRole, joinCode }));
    setActiveTab('game');
  };

  const handleSwitchToLocal = () => {
    setIsMultiplayer(false);
    setCurrentRoomId('mision-piura-01');
    setAuthenticatedRole(null);
    setRoomJoinCode(null);
    localStorage.removeItem(SESSION_KEY);
  };

  const handleConfigureSupabase = (url: string, anonKey: string) => {
    setCustomCredentials({ url, anonKey });
  };

  // Hallazgo científico derivado estrictamente del snapshot confirmado
  const floodSnap = snapshot as FloodSnapshot | null;
  const currentFinding: Finding =
    floodSnap?.reportFinding ??
    (snapshot?.observations.some((o) => o.quality === 'cloudy' && o.finding === 'insufficient')
      ? 'insufficient'
      : (snapshot?.observations.find((o) => o.finding)?.finding ?? 'possible_flood'));

  return (
    <div
      onClick={handleUserInteraction}
      className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950"
    >
      {/* Barra de Navegación Superior */}
      <header className="bg-slate-900 border-b border-cyan-900/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              soundManager.playClick();
              setActiveTab('menu');
            }}
            className="flex items-center gap-2 text-left group"
            title="Volver al Menú Principal"
          >
            <span className="text-xl group-hover:scale-110 transition-transform">🛰️</span>
            <div>
              <h1 className="text-sm md:text-base font-black tracking-tight text-cyan-400 group-hover:text-cyan-300">
                PERUSAT CREW · Operación El Niño
              </h1>
              <p className="text-[10px] text-slate-400 font-mono">
                Simulador Cooperativo · Misión A (Inundaciones en Piura)
              </p>
            </div>
          </button>
        </div>

        {/* Pestañas de Vista */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => {
              soundManager.playClick();
              setActiveTab('menu');
            }}
            className={`px-3 py-1 rounded transition-colors ${
              activeTab === 'menu' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🏠 Menú
          </button>
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

        {/* Selector de Rol, Modo de Red y Escenario */}
        <div className="flex items-center gap-2 text-xs">
          {/* Botón de Acceso al Lobby / Sala Multijugador */}
          <button
            onClick={() => {
              soundManager.playClick();
              setIsLobbyOpen(true);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold transition-all ${
              isMultiplayer
                ? 'bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-sm shadow-cyan-900/50'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
            title="Abrir panel de sala y multijugador"
          >
            <span>{isMultiplayer ? '🌐' : '💻'}</span>
            <span className="font-mono text-[11px]">
              {isMultiplayer ? `Sala: ${roomJoinCode || currentRoomId.slice(0, 6)}` : 'Modo Local'}
            </span>
          </button>

          {/* Conmutador de Rol (con bloqueo de seguridad en multijugador) */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => handleRoleSelect('ground')}
              disabled={isMultiplayer && role !== 'ground'}
              className={`px-2 py-1 rounded font-bold transition-all ${
                role === 'ground'
                  ? 'bg-cyan-500 text-slate-950'
                  : isMultiplayer
                  ? 'text-slate-600 opacity-40 cursor-not-allowed'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={isMultiplayer ? 'Rol asignado por la sala de Supabase' : 'Cambiar a Base CNOIS'}
            >
              {isMultiplayer && role === 'ground' ? '🔒 Base CNOIS' : 'Base CNOIS'}
            </button>
            <button
              onClick={() => handleRoleSelect('satellite')}
              disabled={isMultiplayer && role !== 'satellite'}
              className={`px-2 py-1 rounded font-bold transition-all ${
                role === 'satellite'
                  ? 'bg-amber-500 text-slate-950'
                  : isMultiplayer
                  ? 'text-slate-600 opacity-40 cursor-not-allowed'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={isMultiplayer ? 'Rol asignado por la sala de Supabase' : 'Cambiar a Satélite PerúSAT-1'}
            >
              {isMultiplayer && role === 'satellite' ? '🔒 PerúSAT-1' : 'PerúSAT-1'}
            </button>
          </div>

          {/* Selector de Escenario (sólo editable en modo local) */}
          <select
            value={scenarioMode}
            disabled={isMultiplayer}
            onChange={(e) => {
              soundManager.playClick();
              const mode = e.target.value as 'routine' | 'emergency';
              setScenarioMode(mode);
              if ('setScenario' in activeGateway && typeof (activeGateway as any).setScenario === 'function') {
                (activeGateway as any).setScenario(currentRoomId, mode === 'emergency' ? 'A2' : 'A1');
              }
            }}
            className={`bg-slate-950 text-slate-300 border border-slate-700 rounded px-2 py-1 text-xs ${
              isMultiplayer ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            title={isMultiplayer ? 'En multijugador el escenario se define al crear la sala' : 'Seleccionar escenario'}
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

          {/* Estado de Enlace / Conexión Canónico */}
          <div className="hidden lg:flex items-center gap-1.5 font-mono text-[10px] text-slate-300 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionState === 'connected'
                  ? 'bg-emerald-400 animate-pulse'
                  : connectionState === 'connecting'
                  ? 'bg-cyan-400 animate-ping'
                  : connectionState === 'reconnecting'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-rose-500'
              }`}
            />
            <span>{!isMultiplayer && connectionState === 'connected' ? 'Simulación lista' : connectionNames[connectionState]}</span>
          </div>
        </div>
      </header>

      {/* Contenido Principal según Pestaña */}
      <main className="max-w-5xl mx-auto p-3 md:p-4 space-y-4">
        {activeTab === 'menu' && (
          <MainMenu
            onStartLocalMission={(selectedRole, selectedScenario) => {
              setRole(selectedRole);
              setScenarioMode(selectedScenario);
              if ('setScenario' in activeGateway && typeof (activeGateway as any).setScenario === 'function') {
                (activeGateway as any).setScenario(currentRoomId, selectedScenario === 'emergency' ? 'A2' : 'A1');
              }
              setInitialSceneMode('cabin');
              setActiveTab('game');
            }}
            onOpenMultiplayer={() => setIsLobbyOpen(true)}
            onOpenBriefing={() => setActiveTab('briefing')}
            onOpenExplorableWorld={() => {
              setInitialSceneMode('explorable');
              setActiveTab('game');
            }}
          />
        )}

        {activeTab === 'game' &&
          (!snapshot ? (
            <div className="bg-slate-900 border border-cyan-800/80 rounded-2xl p-8 text-center text-slate-100 max-w-lg mx-auto my-12 space-y-4 shadow-2xl">
              <div className="text-3xl animate-bounce">🛰️</div>
              <h3 className="text-base font-bold text-cyan-300">
                {isMultiplayer ? 'Sincronizando Misión con Supabase...' : 'Iniciando Estación de Mando...'}
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {isMultiplayer
                  ? 'Validando pertenencia de sala y descargando snapshot remoto verificado'
                  : 'Cargando recursos locales del simulador'}
              </p>
              <div className="flex items-center justify-center gap-2 font-mono text-xs text-amber-400">
                <span
                  className={`w-2 h-2 rounded-full ${
                    connectionState === 'connected'
                      ? 'bg-emerald-400'
                      : connectionState === 'connecting'
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-rose-400'
                  }`}
                />
                <span>Estado: {!isMultiplayer && connectionState === 'connected' ? 'Simulación lista' : connectionNames[connectionState]}</span>
              </div>
              {storeError && (
                <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl font-mono text-left space-y-2">
                  <div>⚠️ {storeError.message}</div>
                  <button
                    onClick={() => void store.getState().reconnect()}
                    className="px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-xs"
                  >
                    Reintentar conexión ↻
                  </button>
                </div>
              )}
            </div>
          ) : (
            <StationCanvas
              snapshot={snapshot}
              role={role}
              gateway={activeGateway}
              scenarioMode={scenarioMode}
              onRoleChange={(newRole) => setRole(newRole)}
              isMultiplayer={isMultiplayer}
              initialSceneMode={initialSceneMode}
            />
          ))}

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
                <h3 className="font-bold text-amber-400 text-sm">Escenario simulado · referencia NASA GPM/IMERG V07</h3>
                <p className="leading-relaxed">
                  Tasa hipotética del ejercicio: <strong>42.5 mm/h</strong> sobre el norte peruano. No es una medición NASA de una fecha real.
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

        {activeTab === 'report' && snapshot && (
          <FinalMissionReport
            snapshot={snapshot}
            finding={currentFinding}
            appliedEvents={activeGateway.getAppliedEvents ? activeGateway.getAppliedEvents(snapshot.roomId) : []}
            onReset={handleResetMission}
            onClose={() => setActiveTab('game')}
          />
        )}
      </main>

      {/* Modal de Sala y Multijugador */}
      <RoomLobbyModal
        isOpen={isLobbyOpen}
        onClose={() => setIsLobbyOpen(false)}
        isMultiplayer={isMultiplayer}
        currentRoomId={currentRoomId}
        roomJoinCode={roomJoinCode}
        assignedRole={authenticatedRole}
        connectionState={connectionState}
        supabaseGateway={supabaseGateway}
        onSwitchToLocal={handleSwitchToLocal}
        onRoomJoined={handleRoomJoined}
        onConfigureSupabase={handleConfigureSupabase}
      />

      {/* Pie de Página Ético e Informativo */}
      <footer className="border-t border-slate-900 py-6 px-4 text-center text-xs text-slate-500 space-y-1">
        <p>
          <strong>PERUSAT CREW: Operación El Niño</strong> · Desarrollado para NASA Space Apps Challenge 2026.
        </p>
        <p className="text-[11px]">
          Simulación didáctica basada en referencias de CONIDA / PerúSAT-1 y NASA GPM/IMERG. No constituye un servicio real de alerta temprana.
        </p>
        <p className="text-[10px] text-slate-600 pt-1 font-mono">
          <span>Acceso jurado / evaluador: Pulsa <kbd className="bg-slate-900 border border-slate-800 px-1 py-0.5 rounded text-slate-400">Ctrl+Shift+D</kbd> o añade <code className="text-cyan-600">?dev=true</code> para abrir DevTools y arnés técnico.</span>
        </p>
      </footer>
    </div>
  );
};
