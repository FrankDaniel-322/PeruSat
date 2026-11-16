import React, { useState, useEffect } from 'react';
import { soundManager } from '../audio/SoundManager';

interface EarthToPiuraZoomProps {
  onClose: () => void;
  onProceedToCapture?: () => void;
}

type ZoomStage = 'earth' | 'south_america' | 'peru' | 'piura' | 'basin' | 'naomi_lock';

interface StageMeta {
  id: ZoomStage;
  title: string;
  subtitle: string;
  scaleLabel: string;
  telemetry: string;
  description: string;
}

const STAGES: StageMeta[] = [
  {
    id: 'earth',
    title: '1. ÓRBITA GLOBAL LEO',
    subtitle: 'PerúSAT-1 en Órbita Heliosincrónica (SSO)',
    scaleLabel: 'Altitud: 673 km · Inclinación: 98.2°',
    telemetry: 'VELOCIDAD: 7.5 km/s · PERIODO: 98 min · REFERENCIAS: CONIDA / NASA GPM',
    description: 'Vigilancia remota del Pacífico oriental. Se detectan anomalías de temperatura superficial marina (TSM) asociadas al fenómeno de El Niño.',
  },
  {
    id: 'south_america',
    title: '2. CONTINENTE SUDAMERICANO',
    subtitle: 'Frente de Presión y Vientos Alisios',
    scaleLabel: 'Escala Continental: 1:15,000,000',
    telemetry: 'ZONA DE CONVERGENCIA INTERTROPICAL (ITCZ) ACTIVA SOBRE EL PACÍFICO SUR',
    description: 'Masas de nubes convectivas y frentes húmedos se desplazan hacia la costa norte de Sudamérica.',
  },
  {
    id: 'peru',
    title: '3. REPÚBLICA DEL PERÚ',
    subtitle: 'Cobertura del Centro Nacional de Operaciones de Imágenes Satelitales (CNOIS)',
    scaleLabel: 'Territorio Nacional: 1,285,216 km²',
    telemetry: 'LAT: 4°30\'S a 18°20\'S · LONG: 68°39\'W a 81°19\'W · BASE: Pucusana, Lima',
    description: 'El CNOIS activa el protocolo de emergencia por inundaciones ante el aviso de crecidas fluviales extraordinarias.',
  },
  {
    id: 'piura',
    title: '4. DEPARTAMENTO DE PIURA',
    subtitle: 'Costa Norte · Zona de Alto Riesgo de Inundación',
    scaleLabel: 'Área Departamental: 35,892 km²',
    telemetry: 'ESCENARIO SIMULADO: >120 mm/24h · ALERTA FICTICIA',
    description: 'La cuenca baja del río Piura y los campos agrícolas del valle del Chira registran riesgo inminente de anegamiento.',
  },
  {
    id: 'basin',
    title: '5. CUENCA HIDROGRÁFICA PIURA - CHIRA',
    subtitle: 'Intersección Fluvial y Zonas Pobladas',
    scaleLabel: 'Resolución Cartográfica: 1:50,000',
    telemetry: 'CAUDALES HIPOTÉTICOS · RÍO PIURA: >1,900 m³/s · CHIRA: >2,200 m³/s',
    description: 'Sectores críticos identificados: Puente Sánchez Cerro, Tambogrande, Catacaos y terrazas de cultivo en Chira.',
  },
  {
    id: 'naomi_lock',
    title: '6. RETÍCULA FOCAL SENSOR NAOMI',
    subtitle: 'Bloqueo de Objetivo Óptico Submétrico',
    scaleLabel: 'Resolución: 0.7m Pancromático / 2.8m Multiespectral',
    telemetry: 'SWATH: 14.5 km · ÁNGULO ROLL: -4.2° · MATRIZ CCD LISTA PARA DISPARO',
    description: 'Coordenadas UTM fijadas. El Satélite PerúSAT-1 se encuentra alineado sobre la cuenca del Río Piura.',
  },
];

export const EarthToPiuraZoom: React.FC<EarthToPiuraZoomProps> = ({ onClose, onProceedToCapture }) => {
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);

  const stage = STAGES[currentIdx];

  // Auto-play de la transición cinematográfica
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setCurrentIdx((prev) => {
        if (prev >= STAGES.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        soundManager.playClick();
        return prev + 1;
      });
    }, 2800);
    return () => clearInterval(timer);
  }, [isPlaying]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-fadeIn">
      <div className="bg-slate-900 border-2 border-cyan-500 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Cabecera Técnica */}
        <div className="bg-slate-950 border-b border-cyan-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛰️</span>
            <div>
              <h2 className="text-xs md:text-sm font-black tracking-wider text-cyan-400 font-mono">
                TELEMETRÍA ORBITAL · SECUENCIA DE APROXIMACIÓN A PIURA
              </h2>
              <p className="text-[10px] text-slate-400 font-mono">
                Misión A · Fenómeno de El Niño · Sensor Óptico NAOMI (PerúSAT-1)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                soundManager.playClick();
                setIsPlaying(!isPlaying);
              }}
              className={`px-3 py-1 rounded text-xs font-mono font-bold border transition-colors ${
                isPlaying
                  ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                  : 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
              }`}
            >
              {isPlaying ? '⏸ Pausar' : '▶ Reproducir'}
            </button>
            <button
              onClick={() => {
                soundManager.playClick();
                onClose();
              }}
              className="text-slate-400 hover:text-white px-2 py-1 text-sm font-mono font-bold"
              title="Cerrar visor orbital"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Lienzo Principal de Visualización Cartográfica / Pixel Art */}
        <div className="relative bg-slate-950 flex-1 min-h-[320px] md:min-h-[420px] flex items-center justify-center overflow-hidden border-b border-cyan-900/40">
          {/* Cuadrícula de Radar */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: 'linear-gradient(#07d8f8 1px, transparent 1px), linear-gradient(90deg, #07d8f8 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />

          {/* Renderizado Gráfico según Etapa */}
          <div className="relative w-full h-full flex items-center justify-center p-4">
            {stage.id === 'earth' && (
              <div className="relative flex flex-col items-center justify-center animate-zoomIn">
                {/* Planeta Tierra */}
                <div className="w-56 h-56 md:w-72 md:h-72 rounded-full bg-gradient-to-tr from-blue-950 via-blue-800 to-cyan-700 border-4 border-cyan-400/80 shadow-[0_0_60px_rgba(7,216,248,0.4)] relative overflow-hidden flex items-center justify-center">
                  {/* Masa continental Sudamérica esquemática */}
                  <div className="absolute w-28 h-44 bg-emerald-600/70 rounded-full rotate-12 blur-[1px] translate-x-4 translate-y-2 border border-emerald-400/40" />
                  <div className="absolute w-20 h-28 bg-emerald-500/60 rounded-full -rotate-6 translate-x-2 -translate-y-8" />
                  {/* Nubes ciclónicas El Niño */}
                  <div className="absolute inset-0 bg-white/20 rounded-full mix-blend-overlay animate-pulse" />
                  {/* Satélite en órbita */}
                  <div className="absolute top-6 right-10 flex items-center gap-1.5 animate-bounce">
                    <span className="text-xs">🛰️</span>
                    <span className="text-[8px] font-mono text-cyan-300 bg-slate-950/80 px-1 rounded">PerúSAT-1 (SSO)</span>
                  </div>
                </div>
                {/* Anillo orbital */}
                <div className="absolute w-72 h-72 md:w-96 md:h-96 rounded-full border border-dashed border-cyan-400/50 pointer-events-none rotate-45" />
              </div>
            )}

            {stage.id === 'south_america' && (
              <div className="relative flex flex-col items-center justify-center animate-zoomIn">
                <div className="w-72 h-80 md:w-96 md:h-96 bg-blue-950/60 rounded-2xl border-2 border-cyan-600/60 relative p-4 flex items-center justify-center">
                  {/* Silueta Sudamérica */}
                  <div className="w-48 h-64 bg-slate-900 border border-cyan-500/40 rounded-3xl relative overflow-hidden flex items-center justify-center">
                    <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/40 via-emerald-900/30 to-blue-950/60" />
                    {/* Cordillera de los Andes */}
                    <div className="absolute left-6 top-8 bottom-8 w-4 bg-amber-900/40 border-r border-amber-500/40 transform -skew-x-6" />
                    {/* Punto Perú */}
                    <div className="absolute left-10 top-20 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
                      <span className="text-[10px] font-mono font-bold text-cyan-300 bg-slate-950/90 px-1.5 py-0.5 rounded border border-cyan-500">
                        PERÚ
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {stage.id === 'peru' && (
              <div className="relative flex flex-col items-center justify-center animate-zoomIn">
                <div className="w-80 h-80 md:w-96 md:h-96 bg-slate-900/80 border-2 border-cyan-500/80 rounded-2xl relative p-4 flex items-center justify-center">
                  {/* Mapa esquemático del Perú */}
                  <svg viewBox="0 0 200 240" className="w-64 h-64 text-cyan-400 fill-cyan-950/40 stroke-current stroke-2">
                    {/* Polígono estilizado del territorio peruano */}
                    <polygon points="40,30 80,20 130,40 170,80 150,140 160,190 120,220 80,200 50,160 30,110 30,60" />
                    {/* Línea costera */}
                    <path d="M 40,30 Q 30,80 50,160 Q 80,200 120,220" fill="none" stroke="#ffb02e" strokeWidth="2.5" />
                  </svg>
                  {/* Marcador Piura en el extremo norte */}
                  <div className="absolute left-14 top-14 flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-amber-500 animate-ping" />
                    <span className="text-[10px] font-mono font-bold text-amber-300 bg-slate-950/90 px-2 py-1 rounded border border-amber-500 shadow-lg">
                      📍 DPTO. PIURA (ZONA ALERTA)
                    </span>
                  </div>
                  {/* Marcador CNOIS Pucusana */}
                  <div className="absolute left-28 top-44 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span className="text-[8px] font-mono text-cyan-200 bg-slate-950/90 px-1 rounded">
                      CNOIS (LIMA)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {stage.id === 'piura' && (
              <div className="relative flex flex-col items-center justify-center animate-zoomIn">
                <div className="w-80 h-80 md:w-96 md:h-96 bg-slate-900 border-2 border-amber-500/80 rounded-2xl relative p-5 flex flex-col items-center justify-center">
                  <div className="w-full text-center mb-2">
                    <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/80 px-2.5 py-1 rounded border border-amber-600">
                      ZONA COSTERA NORTE · VULNERABILIDAD EL NIÑO
                    </span>
                  </div>
                  {/* Esquema de relieve y litoral */}
                  <div className="w-full h-56 bg-slate-950 rounded-xl border border-cyan-800 relative overflow-hidden p-3">
                    {/* Mar Pacífico */}
                    <div className="absolute left-0 top-0 bottom-0 w-24 bg-blue-950/80 border-r-2 border-cyan-400 flex items-center justify-center">
                      <span className="text-[9px] font-mono text-cyan-400 -rotate-90">OCÉANO PACÍFICO</span>
                    </div>
                    {/* Valles y cuencas */}
                    <div className="absolute right-4 top-8 flex flex-col gap-3 font-mono text-xs">
                      <div className="flex items-center gap-2 bg-slate-900/90 p-2 rounded border border-cyan-600">
                        <span className="text-cyan-400 font-bold">≈ Río Chira</span>
                        <span className="text-[9px] text-slate-300">Valle Agrícola / Sullana</span>
                      </div>
                      <div className="flex items-center gap-2 bg-slate-900/90 p-2 rounded border border-amber-500">
                        <span className="text-amber-400 font-bold">≈ Río Piura</span>
                        <span className="text-[9px] text-amber-200">Cauce Urbano / Catacaos</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {stage.id === 'basin' && (
              <div className="relative flex flex-col items-center justify-center animate-zoomIn">
                <div className="w-80 h-80 md:w-[420px] md:h-80 bg-slate-900 border-2 border-cyan-500 rounded-2xl relative p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-300 border-b border-slate-800 pb-2">
                    <span>CUENCA BAJA DEL RÍO PIURA</span>
                    <span className="text-amber-400 font-bold">RIESGO DE DESBORDE: ALTO</span>
                  </div>

                  {/* Red fluvial con puntos de monitoreo */}
                  <div className="relative w-full h-52 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden">
                    {/* Cauce principal sinuoso */}
                    <svg viewBox="0 0 300 160" className="w-full h-full">
                      <path
                        d="M 20,40 Q 80,30 140,80 T 260,110"
                        fill="none"
                        stroke="#07d8f8"
                        strokeWidth="5"
                        strokeLinecap="round"
                      />
                      {/* Zonas de anegamiento */}
                      <circle cx="140" cy="80" r="14" fill="#ffb02e" opacity="0.4" className="animate-pulse" />
                      <circle cx="140" cy="80" r="4" fill="#ffb02e" />
                      <circle cx="210" cy="98" r="10" fill="#07d8f8" opacity="0.3" />
                      <circle cx="210" cy="98" r="3" fill="#07d8f8" />
                    </svg>

                    <div className="absolute top-3 left-4 bg-slate-900/90 border border-slate-700 px-2 py-1 rounded text-[9px] font-mono text-slate-300">
                      Punto 01: Puente Sánchez Cerro
                    </div>
                    <div className="absolute bottom-3 right-4 bg-slate-900/90 border border-amber-500 px-2 py-1 rounded text-[9px] font-mono text-amber-300">
                      Punto 02: Catacaos / Terraza Fluvial
                    </div>
                  </div>
                </div>
              </div>
            )}

            {stage.id === 'naomi_lock' && (
              <div className="relative flex flex-col items-center justify-center animate-zoomIn">
                <div className="w-80 h-80 md:w-96 md:h-80 bg-slate-900 border-2 border-emerald-500 rounded-2xl relative p-4 flex flex-col items-center justify-center">
                  {/* Visor de Retícula NAOMI */}
                  <div className="relative w-64 h-64 border border-cyan-500/60 rounded-lg flex items-center justify-center overflow-hidden bg-slate-950">
                    {/* Retícula militar / satelital */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-full h-[1px] bg-cyan-500/40" />
                      <div className="absolute h-full w-[1px] bg-cyan-500/40" />
                      <div className="w-36 h-36 border border-emerald-400 rounded-full animate-ping opacity-60" />
                      <div className="w-40 h-40 border-2 border-dashed border-emerald-400 rounded-full" />
                      <div className="w-16 h-16 border border-amber-400" />
                    </div>

                    <div className="z-10 text-center font-mono space-y-1">
                      <div className="text-xs font-black text-emerald-400 bg-slate-950/90 px-3 py-1 rounded border border-emerald-500 shadow-lg">
                        🎯 OBJETIVO FIJADO: PIURA-RÍO
                      </div>
                      <div className="text-[9px] text-cyan-300">
                        SWATH: 14.5 KM · NAOMI 0.7M
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Información de Telemetría Overlay */}
          <div className="absolute bottom-3 left-4 right-4 bg-slate-950/90 border border-cyan-800/80 rounded-xl p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-xs font-mono">
            <div>
              <div className="font-bold text-cyan-400 flex items-center gap-2">
                <span>{stage.title}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-300 font-normal">{stage.subtitle}</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">{stage.telemetry}</div>
            </div>
            <div className="text-right text-[10px] text-emerald-400 font-bold bg-emerald-950/40 px-2 py-1 rounded border border-emerald-800">
              {stage.scaleLabel}
            </div>
          </div>
        </div>

        {/* Barra de Progreso y Controles */}
        <div className="bg-slate-950 p-3 md:p-4 flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Botones de Pasos */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto">
            {STAGES.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => {
                  soundManager.playClick();
                  setIsPlaying(false);
                  setCurrentIdx(idx);
                }}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
                  idx === currentIdx
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-md'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {idx + 1}. {s.id === 'earth' ? 'Tierra' : s.id === 'south_america' ? 'Sudamérica' : s.id === 'peru' ? 'Perú' : s.id === 'piura' ? 'Piura' : s.id === 'basin' ? 'Cuenca' : 'Sensor'}
              </button>
            ))}
          </div>

          {/* Acción Siguiente o Transición a Captura */}
          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            {currentIdx < STAGES.length - 1 ? (
              <button
                onClick={() => {
                  soundManager.playClick();
                  setCurrentIdx((prev) => prev + 1);
                }}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs rounded-lg shadow"
              >
                Siguiente Acercamiento →
              </button>
            ) : (
              <button
                onClick={() => {
                  soundManager.playClick();
                  onProceedToCapture?.();
                  onClose();
                }}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs rounded-lg shadow flex items-center gap-1.5 animate-pulse"
              >
                <span>📸 Disparar Sensor NAOMI en Estación Satelital</span>
                <span>→</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
