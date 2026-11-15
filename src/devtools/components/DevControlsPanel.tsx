import React, { useState } from 'react';
import type { Finding, MissionAction, MissionSnapshot, PlayerRole, Quality } from '../../contracts/mission';
import type { DevMissionGateway } from '../DevMissionGateway';

interface DevControlsPanelProps {
  activeRole: PlayerRole;
  onRoleChange: (role: PlayerRole) => void;
  snapshot: MissionSnapshot;
  gateway: DevMissionGateway;
  onActionDispatched: (action: MissionAction, result: 'success' | 'error', errorMsg?: string) => void;
}

export const DevControlsPanel: React.FC<DevControlsPanelProps> = ({
  activeRole,
  onRoleChange,
  snapshot,
  gateway,
  onActionDispatched,
}) => {
  const [loading, setLoading] = useState(false);
  const [targetId, setTargetId] = useState('rio-piura');
  const [profileId, setProfileId] = useState('optico-submetrico');
  const [selectedObsId, setSelectedObsId] = useState<string>('');
  const [finding, setFinding] = useState<Finding>('possible_flood');
  const [reportFinding, setReportFinding] = useState<Finding>('possible_flood');
  const [forcedQuality, setForcedQuality] = useState<Quality>('valid');

  const executeAction = async (action: MissionAction) => {
    setLoading(true);
    try {
      await gateway.dispatch(snapshot.roomId, action);
      onActionDispatched(action, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onActionDispatched(action, 'error', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestObservation = () => {
    executeAction({
      actionId: crypto.randomUUID(),
      actorRole: 'ground',
      expectedRevision: snapshot.revision,
      type: 'REQUEST_OBSERVATION',
      payload: { targetId },
    });
  };

  const handleApprovePlan = () => {
    executeAction({
      actionId: crypto.randomUUID(),
      actorRole: 'satellite',
      expectedRevision: snapshot.revision,
      type: 'APPROVE_PLAN',
      payload: { profileId },
    });
  };

  const handleCaptureImage = () => {
    gateway.faultConfig.forcedQuality = forcedQuality;
    executeAction({
      actionId: crypto.randomUUID(),
      actorRole: 'satellite',
      expectedRevision: snapshot.revision,
      type: 'CAPTURE_IMAGE',
      payload: { targetId: snapshot.selectedTargetId || targetId },
    });
  };

  const handleRequestTransmission = () => {
    const obsId = selectedObsId || snapshot.observations.find((o) => !o.transmitted)?.observationId || '';
    if (!obsId) return;
    executeAction({
      actionId: crypto.randomUUID(),
      actorRole: 'ground',
      expectedRevision: snapshot.revision,
      type: 'REQUEST_TRANSMISSION',
      payload: { observationId: obsId },
    });
  };

  const handleTransmitImage = () => {
    const obsId = selectedObsId || snapshot.observations.find((o) => !o.transmitted)?.observationId || '';
    if (!obsId) return;
    executeAction({
      actionId: crypto.randomUUID(),
      actorRole: 'satellite',
      expectedRevision: snapshot.revision,
      type: 'TRANSMIT_IMAGE',
      payload: { observationId: obsId },
    });
  };

  const handleClassifyImage = () => {
    const obsId = selectedObsId || snapshot.observations.find((o) => o.transmitted)?.observationId || '';
    if (!obsId) return;
    executeAction({
      actionId: crypto.randomUUID(),
      actorRole: 'ground',
      expectedRevision: snapshot.revision,
      type: 'CLASSIFY_IMAGE',
      payload: { observationId: obsId, finding },
    });
  };

  const handleSubmitReport = () => {
    executeAction({
      actionId: crypto.randomUUID(),
      actorRole: 'ground',
      expectedRevision: snapshot.revision,
      type: 'SUBMIT_REPORT',
      payload: { finding: reportFinding },
    });
  };

  const handleResetMission = () => {
    executeAction({
      actionId: crypto.randomUUID(),
      actorRole: activeRole,
      expectedRevision: snapshot.revision,
      type: 'RESET_MISSION',
      payload: {},
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-slate-100 shadow-xl space-y-5">
      {/* Selector de Rol Activo */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-base font-bold text-cyan-400">Panel de Controles de Integración</h2>
          <p className="text-xs text-slate-400">Pruebas directas contra el Gateway canónico</p>
        </div>

        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => onRoleChange('ground')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
              activeRole === 'ground'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Base CNOIS (ground)
          </button>
          <button
            onClick={() => onRoleChange('satellite')}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
              activeRole === 'satellite'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Satélite (satellite)
          </button>
        </div>
      </div>

      {/* Controles de Acción según Rol */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Lado Base CNOIS */}
        <div className={`p-4 rounded-lg border transition-all ${
          activeRole === 'ground'
            ? 'bg-slate-950/80 border-cyan-800'
            : 'bg-slate-950/30 border-slate-800 opacity-60'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
              Acciones de Base CNOIS (ground)
            </h3>
            {activeRole === 'ground' && (
              <span className="text-[10px] bg-cyan-950 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-800">
                ACTIVO
              </span>
            )}
          </div>

          <div className="space-y-3">
            {/* REQUEST_OBSERVATION */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
              <label className="block text-[11px] text-slate-400 mb-1">
                Zona de Interés (Piura):
              </label>
              <div className="flex gap-2">
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="bg-slate-950 text-xs text-slate-200 border border-slate-700 rounded px-2 py-1 flex-1"
                >
                  <option value="rio-piura">Río Piura (Urbano / Puente Bolognesi)</option>
                  <option value="valle-chira">Valle del Chira (Zona Agrícola)</option>
                  <option value="morropon">Morropón (Zonas Bajas Vulnerables)</option>
                </select>
                <button
                  onClick={handleRequestObservation}
                  disabled={loading || snapshot.phase !== 'briefing'}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-xs font-semibold rounded text-white"
                >
                  Solicitar
                </button>
              </div>
            </div>

            {/* REQUEST_TRANSMISSION */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] text-slate-400">Solicitar Descarga de Imagen:</span>
                <span className="text-[10px] text-slate-500">Fase Downlink</span>
              </div>
              <button
                onClick={handleRequestTransmission}
                disabled={loading || snapshot.observations.length === 0}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold rounded text-slate-200"
              >
                REQUEST_TRANSMISSION (Prioritaria)
              </button>
            </div>

            {/* CLASSIFY_IMAGE */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
              <label className="block text-[11px] text-slate-400 mb-1">
                Clasificar Evidencia Óptica:
              </label>
              <div className="flex gap-2">
                <select
                  value={finding}
                  onChange={(e) => setFinding(e.target.value as Finding)}
                  className="bg-slate-950 text-xs text-slate-200 border border-slate-700 rounded px-2 py-1 flex-1"
                >
                  <option value="possible_flood">possible_flood (Afectación detectada)</option>
                  <option value="insufficient">insufficient (Limitación por nubes/calidad)</option>
                  <option value="normal">normal (Sin novedad visible)</option>
                </select>
                <button
                  onClick={handleClassifyImage}
                  disabled={loading || snapshot.observations.every((o) => !o.transmitted)}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold rounded text-slate-200"
                >
                  Clasificar
                </button>
              </div>
            </div>

            {/* SUBMIT_REPORT */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
              <label className="block text-[11px] text-slate-400 mb-1">
                Emitir Informe de Situación (a COEN Simulado):
              </label>
              <div className="flex gap-2">
                <select
                  value={reportFinding}
                  onChange={(e) => setReportFinding(e.target.value as Finding)}
                  className="bg-slate-950 text-xs text-slate-200 border border-slate-700 rounded px-2 py-1 flex-1"
                >
                  <option value="possible_flood">Hallazgo: Posible Inundación</option>
                  <option value="insufficient">Hallazgo: Información Insuficiente</option>
                  <option value="normal">Hallazgo: Normalidad Observada</option>
                </select>
                <button
                  onClick={handleSubmitReport}
                  disabled={loading || snapshot.phase !== 'review'}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-xs font-semibold rounded text-white"
                >
                  Emitir Reporte
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Lado Satélite */}
        <div className={`p-4 rounded-lg border transition-all ${
          activeRole === 'satellite'
            ? 'bg-slate-950/80 border-indigo-800'
            : 'bg-slate-950/30 border-slate-800 opacity-60'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              Acciones de Satélite PerúSAT-1 (satellite)
            </h3>
            {activeRole === 'satellite' && (
              <span className="text-[10px] bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800">
                ACTIVO
              </span>
            )}
          </div>

          <div className="space-y-3">
            {/* APPROVE_PLAN */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
              <label className="block text-[11px] text-slate-400 mb-1">
                Perfil Operativo Óptico:
              </label>
              <div className="flex gap-2">
                <select
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  className="bg-slate-950 text-xs text-slate-200 border border-slate-700 rounded px-2 py-1 flex-1"
                >
                  <option value="optico-submetrico">Submétrico (~70 cm) · 14 MB</option>
                  <option value="optico-detallado">Multiespectral Alta Res · 28 MB</option>
                  <option value="optico-comprimido">Paso Rápido Comprimido · 9 MB</option>
                </select>
                <button
                  onClick={handleApprovePlan}
                  disabled={loading || snapshot.phase !== 'planning'}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold rounded text-white"
                >
                  Aprobar Plan
                </button>
              </div>
            </div>

            {/* CAPTURE_IMAGE + Selector de Calidad para Pruebas */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
              <label className="block text-[11px] text-slate-400 mb-1">
                Ejecutar Captura (Costo: 12 Wh / 14 MB):
              </label>
              <div className="flex gap-2 mb-2">
                <select
                  value={forcedQuality}
                  onChange={(e) => setForcedQuality(e.target.value as Quality)}
                  className="bg-slate-950 text-xs text-slate-200 border border-slate-700 rounded px-2 py-1 flex-1"
                >
                  <option value="valid">Calidad: Válida (Escenario A1)</option>
                  <option value="cloudy">Calidad: Nublada (Escenario A2)</option>
                  <option value="corrupt">Calidad: Corrupta (Escenario A2)</option>
                  <option value="incomplete">Calidad: Incompleta (Escenario A2)</option>
                </select>
              </div>
              <button
                onClick={handleCaptureImage}
                disabled={loading || snapshot.phase !== 'capture' || snapshot.resources.energyWh < 12}
                className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-xs font-semibold rounded text-white"
              >
                CAPTURE_IMAGE ({snapshot.resources.energyWh >= 12 ? 'Batería OK' : 'Batería Baja'})
              </button>
            </div>

            {/* TRANSMIT_IMAGE */}
            <div className="p-2.5 rounded bg-slate-900 border border-slate-800">
              <label className="block text-[11px] text-slate-400 mb-1">
                Transmitir Archivo a Tierra (Costo: 4 Wh + tiempo contacto):
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedObsId}
                  onChange={(e) => setSelectedObsId(e.target.value)}
                  className="bg-slate-950 text-xs text-slate-200 border border-slate-700 rounded px-2 py-1 flex-1"
                >
                  <option value="">-- Seleccionar Observación --</option>
                  {snapshot.observations.map((o) => (
                    <option key={o.observationId} value={o.observationId}>
                      {o.observationId} ({o.sizeMb}MB - {o.transmitted ? 'Descargada' : 'Pendiente'})
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleTransmitImage}
                  disabled={
                    loading ||
                    snapshot.phase !== 'downlink' ||
                    snapshot.resources.contactSeconds < 28
                  }
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-semibold rounded text-white"
                >
                  Bajar Datos
                </button>
              </div>
            </div>

            {/* Inyector de Fallas / Reset */}
            <div className="pt-2 border-t border-slate-800 flex flex-wrap gap-2">
              <button
                onClick={() => gateway.injectResources(snapshot.roomId, { energyWh: 8 })}
                className="px-2 py-1 bg-amber-950/60 hover:bg-amber-900 text-amber-300 text-[11px] rounded border border-amber-800"
              >
                Forzar Batería Baja (8 Wh)
              </button>
              <button
                onClick={() => gateway.injectResources(snapshot.roomId, { contactSeconds: 10 })}
                className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-[11px] rounded border border-rose-800"
              >
                Forzar Fin Contacto (10 s)
              </button>
              <button
                onClick={handleResetMission}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] rounded ml-auto"
              >
                RESET_MISSION
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
