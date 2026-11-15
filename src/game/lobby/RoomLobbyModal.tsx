import React, { useState } from 'react';
import type { PlayerRole } from '../../contracts/mission';
import type { ConnectionState } from '../../core/MissionGateway';
import type { SupabaseMissionGateway } from '../../supabase/SupabaseMissionGateway';
import { isSupabaseConfigured } from '../../supabase/supabaseClient';
import { soundManager } from '../audio/SoundManager';

interface RoomLobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  isMultiplayer: boolean;
  currentRoomId: string;
  roomJoinCode: string | null;
  assignedRole: PlayerRole | null;
  connectionState: ConnectionState;
  supabaseGateway: SupabaseMissionGateway | null;
  onSwitchToLocal: () => void;
  onRoomJoined: (roomId: string, role: PlayerRole, joinCode: string) => void;
  onConfigureSupabase?: (url: string, anonKey: string) => void;
}

export const RoomLobbyModal: React.FC<RoomLobbyModalProps> = ({
  isOpen,
  onClose,
  isMultiplayer,
  currentRoomId,
  roomJoinCode,
  assignedRole,
  connectionState,
  supabaseGateway,
  onSwitchToLocal,
  onRoomJoined,
  onConfigureSupabase,
}) => {
  const [activeTab, setActiveTab] = useState<'create' | 'join' | 'local' | 'config'>(
    isMultiplayer ? 'join' : 'create'
  );

  // Formulario Crear Sala
  const [scenarioId, setScenarioId] = useState<'A1' | 'A2'>('A1');
  const [ownerRole, setOwnerRole] = useState<PlayerRole>('ground');
  const [isCreating, setIsCreating] = useState(false);

  // Formulario Unirse a Sala
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Configuración manual opcional
  const [customUrl, setCustomUrl] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const hasConfig = isSupabaseConfigured() || Boolean(supabaseGateway);

  const handleCopyCode = async (code: string) => {
    soundManager.playClick();
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      // Fallback silencioso
    }
  };

  const handleCreateRoom = async () => {
    if (!supabaseGateway) {
      setErrorMessage('Supabase no está configurado. Revisa las variables de entorno o la pestaña de configuración.');
      soundManager.playAlert();
      return;
    }

    setErrorMessage(null);
    setIsCreating(true);
    soundManager.playClick();

    try {
      const result = await supabaseGateway.createRoom(scenarioId, ownerRole);
      onRoomJoined(result.roomId, result.role, result.joinCode);
      soundManager.playTransmit();
      onClose();
    } catch (err: unknown) {
      soundManager.playAlert();
      setErrorMessage(err instanceof Error ? err.message : 'Error inesperado al crear la sala.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!supabaseGateway) {
      setErrorMessage('Supabase no está configurado. Revisa las variables de entorno o la pestaña de configuración.');
      soundManager.playAlert();
      return;
    }

    const trimmed = joinCodeInput.trim().toUpperCase();
    if (!trimmed || trimmed.length < 4) {
      setErrorMessage('Ingresa un código de sala válido (4-6 caracteres alfanuméricos).');
      soundManager.playAlert();
      return;
    }

    setErrorMessage(null);
    setIsJoining(true);
    soundManager.playClick();

    try {
      const result = await supabaseGateway.joinRoomByCode(trimmed);
      onRoomJoined(result.roomId, result.role, trimmed);
      soundManager.playTransmit();
      onClose();
    } catch (err: unknown) {
      soundManager.playAlert();
      setErrorMessage(err instanceof Error ? err.message : 'Error inesperado al unirse a la sala.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleSaveCustomCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl.trim() || !customKey.trim()) {
      setErrorMessage('Debes completar tanto la URL como la Anon Key de Supabase.');
      return;
    }
    if (onConfigureSupabase) {
      onConfigureSupabase(customUrl.trim(), customKey.trim());
      soundManager.playClick();
      setErrorMessage(null);
      setActiveTab('create');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border-2 border-cyan-500/80 rounded-2xl shadow-2xl max-w-xl w-full p-6 text-slate-100 space-y-5">
        {/* Encabezado del Modal */}
        <div className="flex items-center justify-between border-b border-cyan-900/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛰️</span>
            <div>
              <h2 className="text-base md:text-lg font-black text-cyan-400">
                Lobby Multijugador · PERUSAT CREW
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Conexión cooperativa de dos jugadores en tiempo real (Supabase PostgreSQL + Realtime)
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundManager.playClick();
              onClose();
            }}
            className="text-slate-400 hover:text-white px-2 py-1 rounded text-lg font-bold"
            title="Cerrar ventana"
          >
            ✕
          </button>
        </div>

        {/* Estado Actual de la Sesión */}
        {isMultiplayer ? (
          <div className="bg-cyan-950/40 border border-cyan-700/60 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                🟢 Sala Multijugador Activa
              </span>
              <div className="flex items-center gap-2 font-mono text-[11px]">
                <span
                  className={`w-2 h-2 rounded-full ${
                    connectionState === 'connected'
                      ? 'bg-emerald-400 animate-pulse'
                      : connectionState === 'reconnecting'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-rose-500'
                  }`}
                />
                <span className="capitalize text-slate-300">{connectionState}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/80 p-3 rounded-lg border border-cyan-900/50">
              <div>
                <span className="text-slate-400 block text-[10px]">CÓDIGO DE SALA:</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-base font-black text-cyan-300 tracking-wider">
                    {roomJoinCode || currentRoomId}
                  </span>
                  <button
                    onClick={() => handleCopyCode(roomJoinCode || currentRoomId)}
                    className="px-2 py-0.5 bg-cyan-700/60 hover:bg-cyan-600 rounded text-[10px] text-white"
                  >
                    {copiedCode ? '¡Copiado! ✓' : 'Copiar'}
                  </button>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px]">ROL ASIGNADO (SERVIDOR):</span>
                <span className="font-bold text-white flex items-center gap-1 mt-1">
                  🔒 {assignedRole === 'ground' ? 'Base CNOIS (Tierra)' : 'PerúSAT-1 (Satélite)'}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-cyan-200/80 bg-cyan-950/30 p-2 rounded border border-cyan-900/40">
              💡 <em>En multijugador, tu rol está fijado por la pertenencia a la sala para asegurar el rigor cooperativo y evitar suplantaciones de estación.</em>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => {
                  soundManager.playClick();
                  onSwitchToLocal();
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded text-xs font-semibold"
              >
                ← Salir de la sala y volver a Modo Local
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-300">Modo Actual: </span>
              <span className="text-cyan-400 font-semibold">Simulador Local (Offline)</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Los dos roles se ejecutan en tu navegador sin requerir conexión a internet.
              </p>
            </div>
            <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded font-mono text-[10px]">
              DevMissionGateway
            </span>
          </div>
        )}

        {/* Mensaje de error general si ocurre */}
        {errorMessage && (
          <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-200 text-xs rounded-xl flex items-start gap-2">
            <span>⚠️</span>
            <div className="flex-1">{errorMessage}</div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Pestañas de Navegación del Modal */}
        <div className="flex border-b border-slate-800 gap-1 text-xs font-semibold">
          <button
            onClick={() => {
              soundManager.playClick();
              setErrorMessage(null);
              setActiveTab('create');
            }}
            className={`px-3 py-2 border-b-2 transition-colors ${
              activeTab === 'create'
                ? 'border-cyan-400 text-cyan-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🚀 Crear Sala
          </button>
          <button
            onClick={() => {
              soundManager.playClick();
              setErrorMessage(null);
              setActiveTab('join');
            }}
            className={`px-3 py-2 border-b-2 transition-colors ${
              activeTab === 'join'
                ? 'border-cyan-400 text-cyan-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🛰️ Unirse con Código
          </button>
          <button
            onClick={() => {
              soundManager.playClick();
              setErrorMessage(null);
              setActiveTab('local');
            }}
            className={`px-3 py-2 border-b-2 transition-colors ${
              activeTab === 'local'
                ? 'border-cyan-400 text-cyan-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            💻 Modo Local
          </button>
          <button
            onClick={() => {
              soundManager.playClick();
              setErrorMessage(null);
              setActiveTab('config');
            }}
            className={`px-3 py-2 border-b-2 transition-colors ${
              activeTab === 'config'
                ? 'border-cyan-400 text-cyan-400 bg-slate-800/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚙️ Ajustes Supabase
          </button>
        </div>

        {/* Contenido de la Pestaña: CREAR SALA */}
        {activeTab === 'create' && (
          <div className="space-y-4 text-xs">
            {!hasConfig && (
              <div className="bg-amber-950/40 border border-amber-800/60 p-3 rounded-xl text-amber-200 text-[11px] space-y-1">
                <p className="font-bold">⚠️ Supabase no configurado en este entorno.</p>
                <p>
                  Para jugar en multijugador real se requiere conectar a Supabase. Puedes configurar la URL y Anon Key en la pestaña <strong>⚙️ Ajustes Supabase</strong> o jugar sin conexión en <strong>💻 Modo Local</strong>.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-slate-300 font-bold block">1. Escenario de Operación El Niño:</label>
              <select
                value={scenarioId}
                onChange={(e) => setScenarioId(e.target.value as 'A1' | 'A2')}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-slate-200"
              >
                <option value="A1">A1 · Rutinaria (Inundación fluvial en Piura · Cielo despejado)</option>
                <option value="A2">A2 · Emergencia (Lluvias intensas · Nubes activas sobre la cuenca)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-bold block">2. Tu rol como Anfitrión:</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setOwnerRole('ground');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    ownerRole === 'ground'
                      ? 'border-cyan-400 bg-cyan-950/60 text-white shadow-lg'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-cyan-300 text-sm">🛰️ Base CNOIS</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Control terrestre, prioridad de objetivos y consolidación del informe de emergencia.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setOwnerRole('satellite');
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    ownerRole === 'satellite'
                      ? 'border-amber-400 bg-amber-950/60 text-white shadow-lg'
                      : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-bold text-amber-300 text-sm">PerúSAT-1</div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Operación satelital en órbita, captura óptica y administración de energía.
                  </div>
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={isCreating || !hasConfig}
                className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 text-sm"
              >
                {isCreating ? (
                  <>
                    <span className="animate-spin text-base">⏳</span>
                    <span>Creando sala en Supabase...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Crear Sala y Obtener Código</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Contenido de la Pestaña: UNIRSE A SALA */}
        {activeTab === 'join' && (
          <div className="space-y-4 text-xs">
            {!hasConfig && (
              <div className="bg-amber-950/40 border border-amber-800/60 p-3 rounded-xl text-amber-200 text-[11px] space-y-1">
                <p className="font-bold">⚠️ Supabase no configurado en este entorno.</p>
                <p>
                  Para unirte a una sala remota se requiere conexión con Supabase. Revisa la pestaña <strong>⚙️ Ajustes Supabase</strong>.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-slate-300 font-bold block">
                Ingresa el Código de la Misión (6 caracteres):
              </label>
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="Ejemplo: A9K2F7"
                maxLength={8}
                className="w-full bg-slate-950 border border-cyan-800 focus:border-cyan-400 rounded-xl p-3 text-center text-lg font-mono font-black text-cyan-300 tracking-widest placeholder:text-slate-600 focus:outline-none"
              />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Pide el código a tu compañero de tripulación. La función del servidor te asignará automáticamente el rol complementario (si tu compañero es Base CNOIS, serás PerúSAT-1).
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleJoinRoom}
                disabled={isJoining || !hasConfig || !joinCodeInput.trim()}
                className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg transition-colors flex items-center justify-center gap-2 text-sm"
              >
                {isJoining ? (
                  <>
                    <span className="animate-spin text-base">⏳</span>
                    <span>Conectando con la sala...</span>
                  </>
                ) : (
                  <>
                    <span>🛰️</span>
                    <span>Unirse a la Misión</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Contenido de la Pestaña: MODO LOCAL */}
        {activeTab === 'local' && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <h3 className="font-bold text-cyan-300 text-sm">Simulador en Memoria (Offline)</h3>
              <p className="text-slate-300 leading-relaxed">
                El Modo Local utiliza <code className="text-cyan-400 font-mono">DevMissionGateway</code> y el motor de reglas de Misión A1/A2. Te permite alternar de forma instantánea entre la Base CNOIS y el satélite PerúSAT-1 en la misma pantalla.
              </p>
              <ul className="list-disc list-inside text-slate-400 space-y-1 pt-1 text-[11px]">
                <li>No requiere conexión a Supabase ni internet.</li>
                <li>Ideal para verificar la jugabilidad, mecánicas de recursos y generación del informe.</li>
                <li>Todo el estado permanece seguro en memoria de la sesión.</li>
              </ul>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  soundManager.playClick();
                  onSwitchToLocal();
                  onClose();
                }}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold rounded-xl shadow transition-colors flex items-center justify-center gap-2 text-sm"
              >
                <span>💻</span>
                <span>Activar Modo Local (Simulador)</span>
              </button>
            </div>
          </div>
        )}

        {/* Contenido de la Pestaña: AJUSTES SUPABASE */}
        {activeTab === 'config' && (
          <div className="space-y-4 text-xs">
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[11px] text-slate-300 space-y-1">
              <p className="font-bold text-cyan-300">Variables de Entorno Detectadas:</p>
              <p>
                <strong>VITE_SUPABASE_URL:</strong>{' '}
                <span className="font-mono text-slate-400">
                  {import.meta.env.VITE_SUPABASE_URL || '(No definida en .env)'}
                </span>
              </p>
              <p>
                <strong>VITE_SUPABASE_ANON_KEY:</strong>{' '}
                <span className="font-mono text-slate-400">
                  {import.meta.env.VITE_SUPABASE_ANON_KEY
                    ? `${import.meta.env.VITE_SUPABASE_ANON_KEY.slice(0, 10)}...`
                    : '(No definida en .env)'}
                </span>
              </p>
            </div>

            <form onSubmit={handleSaveCustomCredentials} className="space-y-3">
              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">
                  URL de Supabase (https://xxx.supabase.co):
                </label>
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-slate-200 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-bold block">
                  Anon Public Key:
                </label>
                <input
                  type="password"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  placeholder="eyJhbGciOi..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 font-mono text-slate-200 text-xs"
                />
              </div>

              <p className="text-[10px] text-amber-300/80">
                🔒 <strong>Seguridad:</strong> Utiliza únicamente la clave pública anónima (<code className="font-mono">anon</code>). Nunca ingreses claves secretas o administrativas en el navegador.
              </p>

              <button
                type="submit"
                className="w-full py-2 bg-cyan-700 hover:bg-cyan-600 text-white font-bold rounded-lg transition-colors text-xs"
              >
                Guardar y Conectar Credenciales
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
