import React from 'react';
import type { Finding, MissionSnapshot } from '../../contracts/mission';
import { PERU_REGIONS } from '../maps/PeruRegions';
import { computeScore } from '../../missions/flood/rules';
import type { AppliedEvent, FloodSnapshot } from '../../missions/flood/types';

interface FinalMissionReportProps {
  snapshot: MissionSnapshot;
  finding?: Finding;
  appliedEvents?: AppliedEvent[];
  onReset?: () => void;
  onClose?: () => void;
}

export const FinalMissionReport: React.FC<FinalMissionReportProps> = ({
  snapshot,
  finding,
  appliedEvents = [],
  onReset,
  onClose,
}) => {
  const { observations, roomId } = snapshot;
  const floodSnap = snapshot as FloodSnapshot;

  // Encontrar datos geográficos de contexto
  const targetId = snapshot.selectedTargetId || 'rio-piura';
  const allTargets = Object.values(PERU_REGIONS).flatMap((r) => r.targets);
  const targetInfo = allTargets.find((t) => t.id === targetId) || allTargets[0];

  const nowUtc = new Date().toISOString();
  const reportId = floodSnap.reportId || `REP-PIURA-${roomId.slice(0, 8)}-${Date.now().toString().slice(-4)}`;
  const effectiveFinding: Finding = floodSnap.reportFinding || finding || 'possible_flood';

  // Puntuación oficial calculada por el motor de reglas de Misión A
  const scoreResult = computeScore(floodSnap, appliedEvents);
  const { rigor, engineering, collaboration, communication, efficiency } = scoreResult.breakdown;
  const totalScore = scoreResult.total;

  return (
    <div className="bg-slate-900 border-2 border-cyan-400 rounded-2xl p-6 text-slate-100 shadow-2xl max-w-4xl mx-auto my-4 space-y-6">
      {/* Cabecera Oficial del Informe Simulado */}
      <div className="border-b-2 border-slate-700 pb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">📑</span>
            <h2 className="text-xl font-black text-cyan-400 tracking-tight">
              PERUSAT CREW · INFORME DE SITUACIÓN SATELITAL
            </h2>
          </div>
          <p className="text-xs text-amber-400 font-mono mt-0.5">
            EJERCICIO SIMULADO CON FINES EDUCATIVOS (NASA SPACE APPS 2026) · DESTINATARIO: COEN (SIMULADO)
          </p>
        </div>

        <div className="text-right text-xs text-slate-400 font-mono space-y-0.5">
          <div>Reporte: <strong className="text-slate-200">{reportId}</strong></div>
          <div>Sala: <strong className="text-slate-200">{roomId}</strong></div>
          <div>Emitido: <strong className="text-slate-200">{nowUtc.replace('T', ' ').slice(0, 19)} UTC</strong></div>
        </div>
      </div>

      {/* Grid de Secciones */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
        {/* Sección 1: Objetivo y Contexto NASA IMERG */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h3 className="font-bold text-cyan-300 uppercase tracking-wider text-[11px] border-b border-slate-800 pb-1">
            1. Zona de Observación y Contexto Meteorológico
          </h3>
          <div className="space-y-1.5 text-slate-300">
            <div>
              <span className="text-slate-500">Región / Cuenca:</span>{' '}
              <strong>{targetInfo.name}</strong>
            </div>
            <div>
              <span className="text-slate-500">Coordenadas de Referencia:</span>{' '}
              <span className="font-mono">{targetInfo.coords.lat}° S, {targetInfo.coords.lng}° W</span>
            </div>
            <div>
              <span className="text-slate-500">Precipitación Estimada (NASA GPM/IMERG):</span>{' '}
              <strong className="text-cyan-400 font-mono">{targetInfo.imergContext.rateMmH} mm/h</strong>{' '}
              ({targetInfo.imergContext.accumulated24hMm} mm acum. 24h)
            </div>
            <div>
              <span className="text-slate-500">Fecha del dato IMERG:</span>{' '}
              <span className="font-mono">{targetInfo.imergContext.referenceDateUtc}</span>
            </div>
          </div>

          <div className="p-2.5 rounded bg-blue-950/50 border border-blue-900/60 text-[11px] text-blue-200 leading-relaxed">
            <strong>Diferenciación de Fuente:</strong> {targetInfo.imergContext.scientificNote}
          </div>
        </div>

        {/* Sección 2: Evidencias Ópticas Satelitales (PerúSAT-1 Simulado) */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <h3 className="font-bold text-cyan-300 uppercase tracking-wider text-[11px] border-b border-slate-800 pb-1">
            2. Evidencia Óptica Recibida ({observations.length} imágenes)
          </h3>

          {observations.length === 0 ? (
            <p className="text-slate-500 italic">No se registraron imágenes descargadas.</p>
          ) : (
            <div className="space-y-2">
              {observations.map((obs) => (
                <div
                  key={obs.observationId}
                  className="p-2.5 rounded bg-slate-900 border border-slate-800 flex items-center justify-between"
                >
                  <div>
                    <div className="font-mono font-bold text-slate-200">{obs.observationId}</div>
                    <div className="text-[10px] text-slate-400">
                      Sensor: NAOMI · {obs.sizeMb} MB · UTC: {obs.capturedAtUtc.slice(11, 19)}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        obs.quality === 'valid'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {obs.quality.toUpperCase()}
                    </span>
                    <div className="text-[9px] text-amber-400 font-mono mt-0.5">SIMULADO</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-[11px] text-slate-400">
            <strong>Resolución óptica de referencia:</strong> ~70 cm pancromática / 2.8 m multiespectral (PerúSAT-1).
          </div>
        </div>
      </div>

      {/* Sección 3: Dictamen de Situación y Limitaciones Científicas */}
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 text-xs">
        <h3 className="font-bold text-cyan-300 uppercase tracking-wider text-[11px] border-b border-slate-800 pb-1">
          3. Diagnóstico de Situación y Limitaciones
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1.5">
            <div className="text-slate-400 font-bold">Hallazgo Clasificado:</div>
            <div className="text-base font-bold text-cyan-300">
              {effectiveFinding === 'possible_flood' && 'POSIBLE AFECTACIÓN POR INUNDACIÓN (Requiere corroboración)'}
              {effectiveFinding === 'insufficient' && 'EVIDENCIA INSUFICIENTE (Limitación óptica por nubes)'}
              {effectiveFinding === 'normal' && 'CAUCE DENTRO DE NIVELES HABITUALES'}
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed pt-1">
              {effectiveFinding === 'insufficient'
                ? '«Se observó precipitación elevada en el producto satelital consultado. La imagen disponible presenta limitaciones severas por nubosidad. No es posible confirmar extensión de inundación con la evidencia actual. Se recomienda obtener observaciones complementarias y validar con información de campo».'
                : '«Se identificó ensanchamiento en el espejo de agua sobre zonas agrícolas/urbanas adyacentes al río. Los datos ópticos sugieren vulnerabilidad local, sujeta a confirmación en terreno».'}
            </p>
          </div>

          <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1.5">
            <div className="text-slate-400 font-bold">Limitaciones y Advertencias Técnicas:</div>
            <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
              <li>
                <strong>Límite óptico:</strong> Los sensores en luz visible no pueden atravesar nubes densas. Para condiciones de lluvia activa se requeriría radar de apertura sintética (SAR).
              </li>
              <li>
                <strong>Ventana de enlace:</strong> Operación restringida a un pase orbital de 80 segundos con tasa de bajada simulada a 4 Mb/s.
              </li>
              <li>
                <strong>Prudencia operativa:</strong> Este informe es un insumo técnico de análisis. <em>No constituye orden de evacuación ni reemplaza a los avisos oficiales de SENAMHI o INDECI.</em>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Sección 4: Retroalimentación Educativa y Rúbrica Hackathon (100 pts) */}
      <div className="bg-slate-950 p-4 rounded-xl border border-cyan-800 space-y-3 text-xs">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="font-bold text-cyan-300 uppercase tracking-wider text-[11px]">
            4. Evaluación de Decisiones de Ingeniería (Rúbrica Didáctica Rol 02)
          </h3>
          <span className="font-mono font-black text-sm text-emerald-400 bg-emerald-950 px-2.5 py-0.5 rounded border border-emerald-800">
            Puntaje: {totalScore} / 100 pts
          </span>
        </div>

        {/* Notas del Motor de Reglas */}
        <div className="space-y-1.5">
          <div className="font-bold text-slate-300 text-[11px]">Observaciones del Motor:</div>
          <ul className="space-y-1 text-slate-400 text-[11px]">
            {scoreResult.notes.map((note, idx) => (
              <li key={idx} className="flex items-start gap-1.5">
                <span className="text-cyan-400">◈</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Desglose de Puntos Oficial de Misión A */}
        <div className="grid grid-cols-5 gap-2 pt-2 border-t border-slate-800 text-center font-mono text-[10px]">
          <div className="bg-slate-900 p-1.5 rounded">
            <span className="text-slate-400 block">Rigor</span>
            <strong className="text-cyan-300">{rigor}/30</strong>
          </div>
          <div className="bg-slate-900 p-1.5 rounded">
            <span className="text-slate-400 block">Ingeniería</span>
            <strong className="text-cyan-300">{engineering}/25</strong>
          </div>
          <div className="bg-slate-900 p-1.5 rounded">
            <span className="text-slate-400 block">Cooperación</span>
            <strong className="text-cyan-300">{collaboration}/20</strong>
          </div>
          <div className="bg-slate-900 p-1.5 rounded">
            <span className="text-slate-400 block">Transmisión</span>
            <strong className="text-cyan-300">{communication}/15</strong>
          </div>
          <div className="bg-slate-900 p-1.5 rounded">
            <span className="text-slate-400 block">Eficiencia</span>
            <strong className="text-cyan-300">{efficiency}/10</strong>
          </div>
        </div>
      </div>

      {/* Botones de Acción */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded text-slate-200 border border-slate-700"
        >
          🖨️ Imprimir / Guardar PDF del Informe
        </button>

        <div className="flex gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded text-slate-200"
            >
              Cerrar Vista
            </button>
          )}
          {onReset && (
            <button
              onClick={onReset}
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-xs font-bold rounded text-white shadow-lg"
            >
              🔄 Iniciar Nueva Misión Cooperativa
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
