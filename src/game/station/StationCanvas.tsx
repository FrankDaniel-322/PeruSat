import React, { useEffect, useRef, useState } from 'react';
import type { Finding, MissionAction, MissionSnapshot, PlayerRole } from '../../contracts/mission';
import type { MissionGateway } from '../../core/MissionGateway';
import { isEvidence } from '../../missions/flood/rules';
import { SCENARIOS } from '../../missions/flood/config';
import type { AppliedEvent, FloodSnapshot } from '../../missions/flood/types';
import { soundManager } from '../audio/SoundManager';
import { missionBridge, type StationId } from '../../integration/missionBridge';
import { PhaserGame } from '../../integration/PhaserGame';
import { drawPeruMap } from '../maps/PeruRegions';
import { FinalMissionReport } from '../report/FinalMissionReport';

interface StationCanvasProps {
  snapshot: MissionSnapshot;
  role: PlayerRole;
  gateway: MissionGateway & { getAppliedEvents?: (roomId: string) => AppliedEvent[] };
  onActionSent?: (action: MissionAction) => void;
  scenarioMode?: 'routine' | 'emergency';
}

interface CameraProfile {
  id: 'compressed' | 'standard' | 'detailed';
  name: string;
  sizeMb: number;
  energyWh: number;
  costCredits: number;
  downlinkSec: number;
  description: string;
}

interface ConsequenceToast {
  energyDelta: string;
  budgetDelta: string;
  contactDelta: string;
  summary: string;
}

const PROFILES: Record<'compressed' | 'standard' | 'detailed', CameraProfile> = {
  compressed: {
    id: 'compressed',
    name: 'Comprimido (9 MB)',
    sizeMb: 9,
    energyWh: 12,
    costCredits: 10,
    downlinkSec: 18,
    description: 'Baja resolución. Enlace rápido (18 s), conserva ventana de contacto.',
  },
  standard: {
    id: 'standard',
    name: 'Estándar (14 MB)',
    sizeMb: 14,
    energyWh: 12,
    costCredits: 10,
    downlinkSec: 28,
    description: 'Resolución balanceada (14 MB). Enlace de 28 s a 4 Mb/s.',
  },
  detailed: {
    id: 'detailed',
    name: 'Detallado (28 MB)',
    sizeMb: 28,
    energyWh: 18,
    costCredits: 20,
    downlinkSec: 56,
    description: 'Máxima resolución. Consume 56 s de la ventana de 80 s y más energía.',
  },
};

export const StationCanvas: React.FC<StationCanvasProps> = ({
  snapshot,
  role,
  gateway,
  onActionSent,
  scenarioMode = 'routine',
}) => {
  // Modal de consola activa ('base' | 'camera' | 'antenna' | 'report' | null)
  const [activeModal, setActiveModal] = useState<StationId | null>(null);

  // Panel desplegable para los 6 pasos y bitácora
  const [showDrawer, setShowDrawer] = useState<boolean>(false);

  // Resumen breve de consecuencia tras una decisión
  const [consequence, setConsequence] = useState<ConsequenceToast | null>(null);

  // Control de despacho seguro e idempotente
  const lastActionIntentRef = useRef<{ action: MissionAction; error: boolean } | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);

  // Estados locales para tareas de consola
  const [selectedProvince, setSelectedProvince] = useState<'piura' | 'sullana'>('piura');
  const [selectedTarget, setSelectedTarget] = useState<'rio-piura' | 'rio-chira'>('rio-piura');
  const [selectedProfile, setSelectedProfile] = useState<'compressed' | 'standard' | 'detailed'>('standard');
  const [aimValue, setAimValue] = useState<number>(66);
  const [radioFreq, setRadioFreq] = useState<number>(116);
  const [selectedFinding, setSelectedFinding] = useState<Finding>('possible_flood');
  const [actionError, setActionError] = useState<string | null>(null);
  const [eventLogs, setEventLogs] = useState<string[]>([
    '◈ Sistema inicializado. Monitoreo simulado en cuenca del Río Piura.',
  ]);

  // Cálculos de estado y reglas según contrato de Misión A
  const floodSnap = snapshot as FloodSnapshot;
  const usefulEvidence = snapshot.observations.filter(isEvidence).length;
  const scenarioDef = SCENARIOS[floodSnap.scenarioId ?? (scenarioMode === 'emergency' ? 'A2' : 'A1')];
  const requiredEvidence = scenarioDef?.requiredValidEvidence ?? (scenarioMode === 'emergency' ? 1 : 2);
  const hasPendingObservations = snapshot.observations.some((o) => !o.transmitted);
  const hasUnclassifiedObservations = snapshot.observations.some((o) => o.transmitted && !o.finding);

  // Si ya se observó Río Piura, sugerir por defecto Río Chira para la 2da observación
  useEffect(() => {
    if (snapshot.observations.some((o) => o.targetId === 'rio-piura' || o.targetId === 'piura-rio')) {
      setSelectedProvince('sullana');
      setSelectedTarget('rio-chira');
    }
  }, [snapshot.observations]);

  // Estación canónica según la fase y estado de avance de la misión
  const getPhaseStation = (phase: MissionSnapshot['phase']): StationId => {
    switch (phase) {
      case 'briefing':
        return 'base';
      case 'planning':
        return 'camera';
      case 'capture':
        return hasPendingObservations ? 'antenna' : 'camera';
      case 'downlink':
        return 'antenna';
      case 'review':
        if (!hasUnclassifiedObservations && usefulEvidence < requiredEvidence) {
          return 'base';
        }
        return 'report';
      case 'debrief':
        return 'report';
    }
  };

  const currentPhaseStation = getPhaseStation(snapshot.phase);

  // Sincronizar baliza activa en Phaser
  useEffect(() => {
    missionBridge.requestGameInteraction({
      kind: 'setActiveStation',
      stationId: currentPhaseStation,
    });
  }, [currentPhaseStation]);

  // Escuchar selección desde Phaser
  useEffect(() => {
    const unsubscribe = missionBridge.onPhaserInteraction((interaction) => {
      if (interaction.kind === 'stationSelected') {
        soundManager.playClick();
        setActiveModal(interaction.stationId);
      }
    });
    return unsubscribe;
  }, []);

  // Instrucción concisa del Gato Guía (máx 1 frase corta)
  const getShortCatInstruction = () => {
    if (snapshot.phase === 'briefing') {
      return role === 'ground'
        ? 'Elige la provincia y el río a observar.'
        : 'Espera la solicitud de observación de la Base.';
    }
    if (snapshot.phase === 'planning') {
      return role === 'satellite'
        ? 'Ajusta la resolución según el tiempo de antena.'
        : 'Satélite calcula energía y tiempo de pase.';
    }
    if (snapshot.phase === 'capture') {
      if (hasPendingObservations) {
        return 'Imagen en memoria de a bordo. Pasa a antena.';
      }
      return role === 'satellite'
        ? 'Centra la mira en la marca cian y dispara.'
        : 'Satélite alineando sensor óptico NAOMI.';
    }
    if (snapshot.phase === 'downlink') {
      return role === 'satellite'
        ? 'Sintoniza a 116 MHz y descarga la imagen.'
        : 'Esperando bajada de telemetría a Punta Hermosa.';
    }
    if (snapshot.phase === 'review') {
      if (hasUnclassifiedObservations) {
        if (scenarioMode === 'emergency' || snapshot.observations.some((o) => o.quality === 'cloudy')) {
          return '¡Nubes densas! Declara evidencia insuficiente.';
        }
        return 'Analiza la imagen recibida antes del informe.';
      }
      if (usefulEvidence < requiredEvidence) {
        return '¡Falta corroboración! Solicita la 2da cuenca (Río Chira).';
      }
      return '¡Evidencias listas! Emite el informe de situación.';
    }
    if (snapshot.phase === 'debrief') {
      return 'Revisa el balance y el informe simulado.';
    }
    return 'Coordina las operaciones con tu compañero.';
  };

  const isCatAlert =
    (snapshot.phase === 'review' && scenarioMode === 'emergency') ||
    snapshot.resources.energyWh < 15 ||
    snapshot.resources.contactSeconds < 20;

  // Acciones hacia el gateway con protección de doble clic e idempotencia
  const handleDispatch = async (
    action: MissionAction,
    successMessage: string,
    consequenceData?: ConsequenceToast,
  ) => {
    if (isDispatching) return;
    setActionError(null);
    setIsDispatching(true);

    let actionToSend = action;
    if (
      lastActionIntentRef.current?.error &&
      lastActionIntentRef.current.action.type === action.type &&
      lastActionIntentRef.current.action.actorRole === action.actorRole
    ) {
      actionToSend = {
        ...action,
        actionId: lastActionIntentRef.current.action.actionId,
        expectedRevision: snapshot.revision,
      };
    } else {
      lastActionIntentRef.current = { action, error: false };
    }

    try {
      await gateway.dispatch(snapshot.roomId, actionToSend);
      lastActionIntentRef.current = null;
      setEventLogs((prev) => [successMessage, ...prev.slice(0, 9)]);
      if (consequenceData) {
        setConsequence(consequenceData);
      }
      onActionSent?.(actionToSend);
      setActiveModal(null);
    } catch (err: unknown) {
      if (lastActionIntentRef.current) {
        lastActionIntentRef.current.error = true;
      }
      const msg = err instanceof Error ? err.message : 'Error al despachar acción';
      setActionError(msg);
      soundManager.playAlert();
      missionBridge.requestGameInteraction({ kind: 'triggerAlertEffect' });
    } finally {
      setIsDispatching(false);
    }
  };

  // 1. Solicitud de observación (Base)
  const handleRequestObservation = () => {
    soundManager.playClick();
    void handleDispatch(
      {
        actionId: crypto.randomUUID(),
        actorRole: 'ground',
        expectedRevision: snapshot.revision,
        type: 'REQUEST_OBSERVATION',
        payload: { targetId: selectedTarget },
      },
      `✓ Solicitud enviada sobre ${selectedTarget === 'rio-piura' ? 'Río Piura' : 'Río Chira'}.`,
      {
        energyDelta: '0 Wh',
        budgetDelta: '0 cr',
        contactDelta: `${snapshot.resources.contactSeconds} s`,
        summary: `Objetivo fijado: ${selectedTarget === 'rio-piura' ? 'Río Piura' : 'Río Chira'}. Satélite en posición.`,
      },
    );
  };

  // 2. Aprobación de plan y perfil (Satélite)
  const handleApprovePlan = () => {
    const prof = PROFILES[selectedProfile];
    if (snapshot.resources.energyWh < prof.energyWh) {
      setActionError(`Energía insuficiente (${snapshot.resources.energyWh} Wh < ${prof.energyWh} Wh).`);
      soundManager.playAlert();
      return;
    }
    soundManager.playClick();
    void handleDispatch(
      {
        actionId: crypto.randomUUID(),
        actorRole: 'satellite',
        expectedRevision: snapshot.revision,
        type: 'APPROVE_PLAN',
        payload: { profileId: selectedProfile },
      },
      `✓ Plan aprobado: ${prof.name}.`,
      {
        energyDelta: `-${prof.energyWh} Wh`,
        budgetDelta: `-${prof.costCredits} cr`,
        contactDelta: `Requiere ${prof.downlinkSec} s`,
        summary: `Perfil ${prof.name}: ${prof.downlinkSec} s de enlace previstos a 4 Mb/s.`,
      },
    );
  };

  // 3. Captura óptica con sensor NAOMI (Satélite)
  const handleCaptureImage = () => {
    soundManager.playCapture();
    missionBridge.requestGameInteraction({ kind: 'triggerShutterEffect' });

    const prof = PROFILES[selectedProfile];
    void handleDispatch(
      {
        actionId: crypto.randomUUID(),
        actorRole: 'satellite',
        expectedRevision: snapshot.revision,
        type: 'CAPTURE_IMAGE',
        payload: { targetId: snapshot.selectedTargetId ?? selectedTarget },
      },
      `✓ Captura óptica realizada con sensor NAOMI.`,
      {
        energyDelta: `-12 Wh`,
        budgetDelta: `0 cr`,
        contactDelta: `${snapshot.resources.contactSeconds} s`,
        summary: `Imagen de ${prof.sizeMb} MB almacenada en memoria de a bordo.`,
      },
    );
  };

  // 4a. Solicitud de transmisión por telemetría (Base)
  const handleRequestTransmission = () => {
    const obs = snapshot.observations.find((o) => !o.transmitted) || snapshot.observations[snapshot.observations.length - 1];
    if (!obs) return;

    soundManager.playClick();
    void handleDispatch(
      {
        actionId: crypto.randomUUID(),
        actorRole: 'ground',
        expectedRevision: snapshot.revision,
        type: 'REQUEST_TRANSMISSION',
        payload: { observationId: obs.observationId },
      },
      `✓ Solicitud de telemetría enviada para ${obs.observationId}.`,
      {
        energyDelta: '0 Wh',
        budgetDelta: '0 cr',
        contactDelta: `${snapshot.resources.contactSeconds} s`,
        summary: `Base CNOIS autorizó la descarga de telemetría de ${obs.sizeMb} MB.`,
      },
    );
  };

  // 4b. Transmisión por antena banda X (Satélite)
  const handleTransmitObservation = () => {
    const obs = snapshot.observations.find((o) => !o.transmitted) || snapshot.observations[snapshot.observations.length - 1];
    if (!obs) return;

    soundManager.playTransmit();
    missionBridge.requestGameInteraction({ kind: 'triggerDownlinkEffect' });

    const transmitSec = Math.ceil((obs.sizeMb * 8) / 4);
    void handleDispatch(
      {
        actionId: crypto.randomUUID(),
        actorRole: 'satellite',
        expectedRevision: snapshot.revision,
        type: 'TRANSMIT_IMAGE',
        payload: { observationId: obs.observationId },
      },
      `✓ Archivo transmitido a Punta Hermosa vía Banda X.`,
      {
        energyDelta: `-4 Wh`,
        budgetDelta: `0 cr`,
        contactDelta: `-${transmitSec} s`,
        summary: `Descarga completada en ${transmitSec} s. Quedan ${snapshot.resources.contactSeconds - transmitSec} s de pase.`,
      },
    );
  };

  // 5a. Clasificación científica de imagen (Base)
  const handleClassifyImage = () => {
    const obs = snapshot.observations.find((o) => o.transmitted && !o.finding) || snapshot.observations[snapshot.observations.length - 1];
    if (!obs) return;

    soundManager.playClick();
    void handleDispatch(
      {
        actionId: crypto.randomUUID(),
        actorRole: 'ground',
        expectedRevision: snapshot.revision,
        type: 'CLASSIFY_IMAGE',
        payload: { observationId: obs.observationId, finding: selectedFinding },
      },
      `✓ Evidencia ${obs.observationId} clasificada como: ${selectedFinding}.`,
      {
        energyDelta: `0 Wh`,
        budgetDelta: `0 cr`,
        contactDelta: `${snapshot.resources.contactSeconds} s`,
        summary: selectedFinding === 'insufficient'
          ? 'Rigor demostrado: declaraste evidencia insuficiente ante limitaciones del sensor.'
          : 'Clasificación de superficie de agua visible registrada.',
      },
    );
  };

  // 5b. Emisión del informe final (Base)
  const handleEvaluateEvidence = () => {
    soundManager.playClick();
    void handleDispatch(
      {
        actionId: crypto.randomUUID(),
        actorRole: 'ground',
        expectedRevision: snapshot.revision,
        type: 'SUBMIT_REPORT',
        payload: { finding: selectedFinding },
      },
      `✓ Informe simulado emitido con dictamen oficial.`,
      {
        energyDelta: `0 Wh`,
        budgetDelta: `0 cr`,
        contactDelta: `${snapshot.resources.contactSeconds} s`,
        summary: 'Misión concluida. Evaluación de decisiones aeroespaciales generada.',
      },
    );
  };

  // 6 Pasos para checklist desplegable
  const missionPhases = [
    { label: 'Elegir provincia y río', completed: snapshot.phase !== 'briefing' },
    { label: 'Configurar resolución', completed: !['briefing', 'planning'].includes(snapshot.phase) },
    { label: 'Realizar captura óptica', completed: snapshot.observations.length > 0 },
    { label: 'Transmitir por antena', completed: snapshot.observations.some((o) => o.transmitted) },
    { label: 'Evaluar evidencia', completed: usefulEvidence >= requiredEvidence || snapshot.phase === 'debrief' },
    { label: 'Emitir informe simulado', completed: snapshot.phase === 'debrief' },
  ];

  const getActionName = () => {
    switch (snapshot.phase) {
      case 'briefing':
        return 'Elegir Provincia y Río';
      case 'planning':
        return 'Configurar Sensor Óptico';
      case 'capture':
        return hasPendingObservations ? 'Transmitir por Antena' : 'Disparar Sensor NAOMI';
      case 'downlink':
        return 'Transmitir por Antena';
      case 'review':
        if (hasUnclassifiedObservations) return 'Clasificar Evidencia';
        if (usefulEvidence < requiredEvidence) return 'Solicitar 2da Observación (Río Chira)';
        return 'Emitir Informe Simulado';
      case 'debrief':
        return 'Ver Informe Simulado';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-2">
      {/* 1. Barra de Estado Esencial Compacta (Objetivo, Recursos y Desplegable) */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-mono shadow-sm">
        {/* Objetivo actual */}
        <div className="flex items-center gap-1.5">
          <span className="text-cyan-400 font-bold">🎯 Objetivo:</span>
          <span className="text-slate-200">
            {snapshot.selectedTargetId === 'rio-chira' ? 'Río Chira (Sullana)' : 'Río Piura (Piura)'}
          </span>
          {scenarioMode === 'emergency' && (
            <span className="text-[10px] text-amber-400 bg-amber-950/80 border border-amber-800 px-1.5 py-0.2 rounded ml-1">
              ☁️ Alerta Lluvias
            </span>
          )}
        </div>

        {/* Recursos esenciales en chips compactos */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1" title="Batería EPS">
            <span className="text-slate-400">⚡</span>
            <span className={snapshot.resources.energyWh < 20 ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
              {snapshot.resources.energyWh}Wh
            </span>
          </div>
          <div className="flex items-center gap-1" title="Almacenamiento disponible">
            <span className="text-slate-400">💾</span>
            <span className={snapshot.resources.storageMb < 15 ? 'text-amber-400 font-bold' : 'text-cyan-300'}>
              {snapshot.resources.storageMb}MB
            </span>
          </div>
          <div className="flex items-center gap-1" title="Ventana de contacto con Punta Hermosa">
            <span className="text-slate-400">📡</span>
            <span className={snapshot.resources.contactSeconds < 25 ? 'text-amber-400 font-bold' : 'text-blue-300'}>
              {snapshot.resources.contactSeconds}s
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1" title="Presupuesto de créditos">
            <span className="text-slate-400">🪙</span>
            <span className="text-slate-300">{snapshot.resources.budgetCredits}cr</span>
          </div>
        </div>

        {/* Botón para abrir el panel desplegable de pasos y bitácora */}
        <button
          onClick={() => {
            soundManager.playClick();
            setShowDrawer(!showDrawer);
          }}
          className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-colors ${
            showDrawer
              ? 'bg-cyan-600 text-white border-cyan-400'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
          }`}
          aria-expanded={showDrawer}
        >
          📋 Pasos y Bitácora {showDrawer ? '▲' : '▼'}
        </button>
      </div>

      {/* 2. Escenario Principal: Cabina Phaser Limpia (Pixel Art sin textos superpuestos) */}
      <div className="cabin-frame relative rounded-lg border-2 border-blue-900/80 overflow-hidden shadow-2xl">
        {/* Escena interactiva Phaser 4 */}
        <PhaserGame />

        {/* Gato Guía Discreto: Instrucciones muy cortas en la parte inferior */}
        <div
          className={`cat-bubble ${isCatAlert ? 'cat-alert' : ''}`}
          role={isCatAlert ? 'alert' : 'status'}
        >
          <strong>{isCatAlert ? '🐱 Gato · Alerta' : '🐱 Gato · Guía'}</strong>
          <span>{getShortCatInstruction()}</span>
        </div>

        {/* Modal de Consola Activa */}
        {activeModal && (
          <div className="station-task-overlay">
            <div className="station-tool">
              <button
                onClick={() => {
                  soundManager.playClick();
                  setActiveModal(null);
                }}
                className="absolute top-2 right-2 text-slate-400 hover:text-cyan-400 font-bold px-2 py-0.5 border border-slate-700 hover:border-cyan-500 bg-slate-900 rounded"
                aria-label="Cerrar consola"
              >
                ✕
              </button>

              {/* Contenido según la consola abierta */}
              {activeModal === 'base' && (
                <div>
                  <div className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider">
                    Base CNOIS · Estación Terrena
                  </div>
                  <h3>Solicitud de Observación Óptica</h3>
                  <p className="text-xs text-slate-300 mb-3">
                    Selecciona el río prioritario para monitoreo de crecida.
                  </p>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <button
                      onClick={() => {
                        setSelectedProvince('piura');
                        setSelectedTarget('rio-piura');
                      }}
                      className={`px-3 py-1.5 text-xs font-mono font-bold rounded border ${
                        selectedProvince === 'piura'
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      Provincia de Piura {snapshot.observations.some((o) => o.targetId === 'rio-piura' || o.targetId === 'piura-rio') ? '✓' : ''}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedProvince('sullana');
                        setSelectedTarget('rio-chira');
                      }}
                      className={`px-3 py-1.5 text-xs font-mono font-bold rounded border ${
                        selectedProvince === 'sullana'
                          ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      Provincia de Sullana {snapshot.observations.some((o) => o.targetId === 'rio-chira' || o.targetId === 'piura-urbano') ? '✓' : ''}
                    </button>
                  </div>

                  {/* Canvas esquemático de mapa */}
                  <div className="border border-slate-700 bg-slate-950 p-1 rounded mb-3">
                    <canvas
                      ref={(canvas) => {
                        if (canvas) {
                          const ctx = canvas.getContext('2d');
                          if (ctx) {
                            drawPeruMap(ctx, 320, 120, selectedTarget, scenarioMode === 'emergency');
                          }
                        }
                      }}
                      width={320}
                      height={120}
                      className="w-full h-auto rounded block"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs bg-slate-900/80 p-2 rounded border border-slate-800 mb-4 font-mono">
                    <span className="text-slate-400">Objetivo seleccionado:</span>
                    <span className="text-cyan-400 font-bold">
                      {selectedTarget === 'rio-piura' ? 'Río Piura' : 'Río Chira'}
                    </span>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleRequestObservation}
                      disabled={
                        role !== 'ground' ||
                        (snapshot.phase !== 'briefing' && snapshot.phase !== 'review') ||
                        isDispatching
                      }
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs rounded shadow"
                    >
                      {role === 'ground'
                        ? (snapshot.observations.length > 0
                            ? 'Enviar Solicitud de 2da Zona al Satélite →'
                            : 'Enviar Solicitud al Satélite →')
                        : 'Solo la Base puede solicitar'}
                    </button>
                  </div>
                </div>
              )}

              {activeModal === 'camera' && (
                <div>
                  <div className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider">
                    Carga Útil · Sensor Óptico NAOMI
                  </div>
                  <h3>
                    {snapshot.phase === 'capture'
                      ? 'Ejecución de Captura Óptica'
                      : 'Configuración de Resolución'}
                  </h3>

                  {snapshot.phase === 'planning' ? (
                    <div>
                      <p className="text-xs text-slate-300 mb-3">
                        Ajusta la resolución considerando que a mayor detalle, más tiempo de antena se consume.
                      </p>

                      <div className="space-y-2 mb-4">
                        {(['compressed', 'standard', 'detailed'] as const).map((profKey) => {
                          const p = PROFILES[profKey];
                          const isSelected = selectedProfile === profKey;
                          return (
                            <button
                              key={profKey}
                              onClick={() => setSelectedProfile(profKey)}
                              className={`w-full text-left p-2 rounded border text-xs font-mono transition-colors ${
                                isSelected
                                  ? 'bg-cyan-950/80 border-cyan-400 text-cyan-200'
                                  : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex justify-between font-bold mb-0.5">
                                <span>{p.name}</span>
                                <span className="text-amber-400">{p.downlinkSec} s enlace</span>
                              </div>
                              <p className="text-[11px] text-slate-400">{p.description}</p>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleApprovePlan}
                          disabled={role !== 'satellite' || snapshot.phase !== 'planning'}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs rounded shadow"
                        >
                          {role === 'satellite' ? 'Aprobar Plan y Configurar Sensor →' : 'Solo Satélite aprueba'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-slate-300 mb-2">
                        Alinea la mira sobre el objetivo cian para estabilizar la toma del satélite.
                      </p>

                      <div className="aim-track">
                        <i></i>
                        <b style={{ left: `${aimValue}%` }}></b>
                      </div>

                      <input
                        type="range"
                        min="10"
                        max="90"
                        value={aimValue}
                        onChange={(e) => setAimValue(Number(e.target.value))}
                        className="w-full accent-cyan-400 mb-3"
                      />

                      <div className="text-center font-mono text-xs mb-4">
                        {Math.abs(aimValue - 66) <= 6 ? (
                          <span className="text-emerald-400 font-bold">✓ Sensor alineado con la cuenca</span>
                        ) : (
                          <span className="text-slate-400">
                            {aimValue < 66 ? 'Desplaza la mira a la derecha →' : '← Desplaza la mira a la izquierda'}
                          </span>
                        )}
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          onClick={handleCaptureImage}
                          disabled={
                            role !== 'satellite' ||
                            snapshot.phase !== 'capture' ||
                            Math.abs(aimValue - 66) > 6
                          }
                          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs rounded shadow"
                        >
                          Disparar Cámara NAOMI 📸
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeModal === 'antenna' && (
                <div>
                  <div className="text-[11px] text-amber-400 font-bold uppercase tracking-wider">
                    Terminal de Enlace · Banda X
                  </div>
                  <h3>Transmisión de Datos a Tierra</h3>
                  <p className="text-xs text-slate-300 mb-3">
                    Sintoniza la frecuencia a 116 MHz para iniciar la bajada de telemetría a Punta Hermosa.
                  </p>

                  <div className="bg-slate-900 p-2.5 rounded border border-slate-800 font-mono text-xs space-y-1 mb-3">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Archivo:</span>
                      <span className="text-cyan-300">
                        {snapshot.observations.find((o) => !o.transmitted)?.observationId ??
                          snapshot.observations[snapshot.observations.length - 1]?.observationId ??
                          'obs-01'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tamaño:</span>
                      <span className="text-cyan-300">
                        {snapshot.observations.find((o) => !o.transmitted)?.sizeMb ??
                          snapshot.observations[snapshot.observations.length - 1]?.sizeMb ??
                          14}{' '}
                        MB
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Tasa de bajada:</span>
                      <span className="text-amber-300">4.0 Mb/s (Banda X)</span>
                    </div>
                  </div>

                  <div className="space-y-1 mb-4 font-mono text-xs">
                    <label className="text-slate-300 flex justify-between">
                      <span>Frecuencia:</span>
                      <span className={radioFreq === 116 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        {radioFreq} MHz {radioFreq === 116 ? '✓ Sintonizada' : '(Ajusta a 116 MHz)'}
                      </span>
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="140"
                      value={radioFreq}
                      onChange={(e) => setRadioFreq(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    {(() => {
                      const activeObs =
                        snapshot.observations.find((o) => !o.transmitted) ||
                        snapshot.observations[snapshot.observations.length - 1];

                      if (activeObs && !activeObs.requested) {
                        return (
                          <button
                            onClick={handleRequestTransmission}
                            disabled={role !== 'ground' || isDispatching}
                            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs rounded shadow"
                          >
                            {role === 'ground'
                              ? 'Solicitar Telemetría (Base CNOIS) 📡'
                              : 'Aguardando solicitud de la Base'}
                          </button>
                        );
                      }

                      return (
                        <button
                          onClick={handleTransmitObservation}
                          disabled={
                            role !== 'satellite' ||
                            radioFreq !== 116 ||
                            !activeObs ||
                            activeObs.transmitted ||
                            isDispatching
                          }
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs rounded shadow"
                        >
                          {activeObs?.transmitted
                            ? '✓ Telemetría Transmitida'
                            : role === 'satellite'
                            ? 'Transmitir por Antena Banda X 📡'
                            : 'Aguardando enlace de Satélite'}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}

              {activeModal === 'report' && (
                <div>
                  <div className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider">
                    Centro de Análisis · CNOIS
                  </div>
                  <h3>
                    {snapshot.phase === 'review'
                      ? 'Evaluación de Evidencia Satelital'
                      : 'Informe de Situación Simulado'}
                  </h3>

                  {snapshot.phase === 'review' ? (
                    <div>
                      <p className="text-xs text-slate-300 mb-3">
                        Inspecciona la imagen satelital recibida y determina el hallazgo prudente.
                      </p>

                      {hasUnclassifiedObservations ? (
                        <>
                          {(() => {
                            const activeObs = snapshot.observations.find((o) => o.transmitted && !o.finding);
                            const isCloudy = activeObs?.quality === 'cloudy';
                            const targetName =
                              activeObs?.targetId === 'rio-chira' || activeObs?.targetId === 'piura-urbano'
                                ? 'Río Chira'
                                : 'Río Piura';
                            return (
                              <div className="border border-slate-700 bg-slate-950 p-2 rounded mb-3 text-center">
                                {isCloudy ? (
                                  <div className="p-3 bg-slate-900 rounded border border-amber-800/60 font-mono text-xs text-amber-300">
                                    ☁️ COBERTURA NUBOSA DETECTADA SOBRE {targetName.toUpperCase()} (LIMITACIÓN ÓPTICA)
                                    <p className="text-[11px] text-slate-400 mt-1">
                                      La nubosidad impide observar el cauce del río con el sensor óptico visible.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="p-3 bg-slate-900 rounded border border-emerald-800/60 font-mono text-xs text-emerald-300">
                                    🛰️ IMAGEN ÓPTICA VÁLIDA · {activeObs?.observationId} ({targetName})
                                    <p className="text-[11px] text-slate-400 mt-1">
                                      Cauce de {targetName} visible con posible desborde en margen.
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          <div className="space-y-1 mb-4 font-mono text-xs">
                            <label className="text-slate-300 block mb-1">Clasificación técnica de esta imagen:</label>
                            <select
                              value={selectedFinding}
                              onChange={(e) => setSelectedFinding(e.target.value as Finding)}
                              className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded p-2 text-xs font-mono"
                            >
                              <option value="possible_flood">Posible inundación / desborde</option>
                              <option value="insufficient">Evidencia insuficiente (recomendado ante nubes)</option>
                              <option value="normal">Sin afectación aparente</option>
                            </select>
                          </div>

                          <div className="flex justify-end gap-2">
                            <button
                              onClick={handleClassifyImage}
                              disabled={role !== 'ground' || isDispatching}
                              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs rounded shadow"
                            >
                              {role === 'ground' ? 'Registrar Clasificación Científica 🔬' : 'Solo la Base clasifica'}
                            </button>
                          </div>
                        </>
                      ) : (
                        /* Todas las imágenes transmitidas están clasificadas */
                        <div className="space-y-4">
                          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                            <div className="flex items-center justify-between text-cyan-400 font-bold border-b border-slate-800 pb-1.5">
                              <span>Evidencias Clasificadas ({snapshot.observations.length})</span>
                              <span className="text-[11px] text-slate-300">
                                Válidas:{' '}
                                <strong
                                  className={
                                    usefulEvidence >= requiredEvidence ? 'text-emerald-400' : 'text-amber-400'
                                  }
                                >
                                  {usefulEvidence} / {requiredEvidence}
                                </strong>
                              </span>
                            </div>
                            <div className="space-y-1">
                              {snapshot.observations.map((obs) => (
                                <div
                                  key={obs.observationId}
                                  className="flex justify-between items-center bg-slate-900/60 p-2 rounded text-[11px]"
                                >
                                  <span>
                                    <strong>{obs.observationId}</strong> ·{' '}
                                    {obs.targetId === 'rio-chira' ? 'Río Chira' : 'Río Piura'}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded font-bold ${
                                      obs.quality === 'valid'
                                        ? 'bg-emerald-950 text-emerald-300'
                                        : 'bg-amber-950 text-amber-300'
                                    }`}
                                  >
                                    {obs.finding}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {usefulEvidence < requiredEvidence ? (
                            /* Caso A1: Se necesita una segunda observación */
                            <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-xl space-y-2 text-xs font-mono">
                              <div className="flex items-center justify-between text-amber-300 font-bold">
                                <span>⚠️ Corroboración Requerida (Misión {floodSnap.scenarioId ?? 'A1'})</span>
                                <span className="text-[10px] bg-amber-900/80 px-2 py-0.5 rounded">Paso 2 de 2</span>
                              </div>
                              <p className="text-[11px] text-slate-300 leading-relaxed">
                                El protocolo exige corroborar al menos dos cuencas hidrográficas (
                                {snapshot.observations.some(
                                  (o) => o.targetId === 'rio-piura' || o.targetId === 'piura-rio'
                                )
                                  ? 'Río Chira'
                                  : 'Río Piura'}
                                ) antes de consolidar el informe final.
                              </p>
                              <div className="pt-1 flex justify-end">
                                {role === 'ground' ? (
                                  <button
                                    onClick={() => {
                                      soundManager.playClick();
                                      if (
                                        snapshot.observations.some(
                                          (o) => o.targetId === 'rio-piura' || o.targetId === 'piura-rio'
                                        )
                                      ) {
                                        setSelectedProvince('sullana');
                                        setSelectedTarget('rio-chira');
                                      } else {
                                        setSelectedProvince('piura');
                                        setSelectedTarget('rio-piura');
                                      }
                                      setActiveModal('base');
                                    }}
                                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded shadow"
                                  >
                                    Solicitar 2da Observación (
                                    {snapshot.observations.some(
                                      (o) => o.targetId === 'rio-piura' || o.targetId === 'piura-rio'
                                    )
                                      ? 'Río Chira'
                                      : 'Río Piura'}
                                    ) →
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-amber-400 italic">
                                    Aguardando que la Base CNOIS solicite la segunda zona...
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            /* Evidencias suficientes: Listo para emitir informe */
                            <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-xl space-y-2 text-xs font-mono">
                              <div className="flex items-center justify-between text-emerald-300 font-bold">
                                <span>✓ Evidencia Suficiente para Dictamen</span>
                                <span className="text-[10px] bg-emerald-900/80 px-2 py-0.5 rounded">Listo</span>
                              </div>
                              <p className="text-[11px] text-slate-300 leading-relaxed">
                                Se ha completado la corroboración requerida. La Base CNOIS puede emitir el informe oficial
                                de situación ante el COEN simulado.
                              </p>
                              <div className="pt-1 flex justify-end">
                                {role === 'ground' ? (
                                  <button
                                    onClick={handleEvaluateEvidence}
                                    disabled={role !== 'ground' || snapshot.phase !== 'review' || isDispatching}
                                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold text-xs rounded shadow"
                                  >
                                    Emitir Informe Oficial ante COEN (Simulado) 📑 →
                                  </button>
                                ) : (
                                  <span className="text-[11px] text-cyan-300 italic">
                                    Aguardando que la Base CNOIS emita el informe final...
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <FinalMissionReport
                        snapshot={snapshot}
                        finding={selectedFinding}
                        appliedEvents={gateway.getAppliedEvents ? gateway.getAppliedEvents(snapshot.roomId) : []}
                      />
                    </div>
                  )}
                </div>
              )}

              {actionError && (
                <div className="mt-3 p-2 bg-red-950 border border-red-800 text-red-300 text-xs font-mono rounded">
                  ⚠️ {actionError}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Barra Inferior de Acción Inmediata (Limpia y Funcional) */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 font-bold">▶ Acción disponible:</span>
          <span className="text-slate-200">
            {snapshot.phase.toUpperCase()} · {role === 'ground' ? 'Base CNOIS' : 'Satélite PerúSAT-1'}
          </span>
        </div>

        <button
          onClick={() => {
            soundManager.playClick();
            setActiveModal(currentPhaseStation);
          }}
          className="px-4 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded shadow transition-colors flex items-center gap-1.5"
        >
          <span>[E]</span>
          <span>{getActionName()} →</span>
        </button>
      </div>

      {/* 4. Resumen Breve de Consecuencia Inmediata tras una Decisión */}
      {consequence && (
        <div className="p-2.5 rounded-lg bg-blue-950/80 border border-cyan-800 text-xs font-mono text-cyan-200 flex items-start justify-between gap-3 shadow-md">
          <div className="space-y-0.5">
            <div className="font-bold text-cyan-400 flex items-center gap-2">
              <span>⚡ {consequence.energyDelta}</span>
              <span>•</span>
              <span>🪙 {consequence.budgetDelta}</span>
              <span>•</span>
              <span>📡 {consequence.contactDelta}</span>
            </div>
            <p className="text-[11px] text-slate-300">{consequence.summary}</p>
          </div>
          <button
            onClick={() => setConsequence(null)}
            className="text-slate-400 hover:text-slate-200 text-xs font-bold px-1"
            title="Descartar resumen"
          >
            ✕
          </button>
        </div>
      )}

      {/* 5. Panel Desplegable (Drawer) para los 6 Pasos y Bitácora */}
      {showDrawer && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-xs shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="font-bold text-cyan-400 uppercase tracking-wider text-xs">
              📋 Pasos de la Misión y Bitácora Operativa
            </h4>
            <button
              onClick={() => setShowDrawer(false)}
              className="text-slate-400 hover:text-slate-200 font-bold px-2 py-0.5 bg-slate-800 rounded"
            >
              Cerrar ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Checklist de 6 pasos */}
            <div>
              <h5 className="text-[11px] font-bold text-slate-400 uppercase mb-2">Progreso de la Misión</h5>
              <ol className="space-y-1.5">
                {missionPhases.map((phase, idx) => (
                  <li
                    key={idx}
                    className={`flex items-center gap-2 ${
                      phase.completed ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        phase.completed
                          ? 'bg-emerald-950 border border-emerald-700 text-emerald-300'
                          : 'bg-slate-800 border border-slate-700 text-slate-500'
                      }`}
                    >
                      {phase.completed ? '✓' : idx + 1}
                    </span>
                    <span>{phase.label}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Bitácora de operaciones */}
            <div>
              <h5 className="text-[11px] font-bold text-slate-400 uppercase mb-2">Registro de Operaciones</h5>
              <ul className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {eventLogs.map((log, i) => (
                  <li key={i} className="border-l-2 border-cyan-500 pl-2 py-0.5 text-[10.5px] text-slate-300">
                    {log}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
