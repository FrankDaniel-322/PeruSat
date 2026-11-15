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
import { EarthToPiuraZoom } from '../cinematics/EarthToPiuraZoom';

interface StationCanvasProps {
  snapshot: MissionSnapshot;
  role: PlayerRole;
  gateway: MissionGateway & { getAppliedEvents?: (roomId: string) => AppliedEvent[] };
  onActionSent?: (action: MissionAction) => void;
  scenarioMode?: 'routine' | 'emergency';
  onRoleChange?: (newRole: PlayerRole) => void;
  isMultiplayer?: boolean;
  initialSceneMode?: 'cabin' | 'explorable';
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
  onRoleChange,
  isMultiplayer = false,
  initialSceneMode = 'cabin',
}) => {
  // Modal de consola activa ('base' | 'camera' | 'antenna' | 'report' | null)
  const [activeModal, setActiveModal] = useState<StationId | null>(null);

  // Modo de visualización: Cabina clásica pixel art o Mundo Explorable 2D con WASD
  const [sceneMode, setSceneMode] = useState<'cabin' | 'explorable'>(initialSceneMode);

  // Visor cinemático de aproximación orbital (Tierra -> Sudamérica -> Perú -> Piura)
  const [isZoomOpen, setIsZoomOpen] = useState<boolean>(false);

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
  // Etapa interactiva en consola geográfica (Tierra -> Sudamérica -> Perú -> Piura -> Cuenca)
  const [geoStage, setGeoStage] = useState<'earth' | 'south_america' | 'peru' | 'piura' | 'target_basin'>('earth');
  const [selectedProfile, setSelectedProfile] = useState<'compressed' | 'standard' | 'detailed'>('standard');
  const [aimValue, setAimValue] = useState<number>(66);
  // Frecuencia satelital Banda X: 8.20 GHz (realista para bajada de imágenes de alta resolución)
  const [radioFreq, setRadioFreq] = useState<number>(8.2);
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
        return hasPendingObservations ? 'antenna' : 'report';
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
        ? 'Sintoniza a 8.2 GHz (Banda X) y descarga la imagen.'
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

  // Información didáctica de la tarea activa y el operador responsable
  const getRequiredStepInfo = () => {
    switch (snapshot.phase) {
      case 'briefing':
        return {
          actorRole: 'ground' as PlayerRole,
          stationId: 'base' as StationId,
          title: 'Elegir Provincia y Río',
          description: 'La Base CNOIS debe seleccionar el río prioritario y solicitar observación al satélite.',
        };
      case 'planning':
        return {
          actorRole: 'satellite' as PlayerRole,
          stationId: 'camera' as StationId,
          title: 'Configurar Sensor NAOMI',
          description: 'El Satélite PerúSAT-1 debe calibrar la resolución y balancear tiempo de enlace vs detalle.',
        };
      case 'capture': {
        const hasPending = snapshot.observations.some((o) => !o.transmitted);
        if (!hasPending) {
          return {
            actorRole: 'satellite' as PlayerRole,
            stationId: 'camera' as StationId,
            title: 'Disparar Cámara NAOMI',
            description: 'El Satélite PerúSAT-1 debe alinear la mira óptica y capturar la imagen de la cuenca.',
          };
        }
        const activeObs = snapshot.observations.find((o) => !o.transmitted);
        if (activeObs && !activeObs.requested) {
          return {
            actorRole: 'ground' as PlayerRole,
            stationId: 'antenna' as StationId,
            title: 'Autorizar Telemetría',
            description: 'La Base CNOIS debe autorizar la bajada de telemetría hacia Punta Hermosa.',
          };
        }
        return {
          actorRole: 'satellite' as PlayerRole,
          stationId: 'antenna' as StationId,
          title: 'Transmitir Banda X (8.2 GHz)',
          description: 'El Satélite PerúSAT-1 debe transmitir los datos por antena Banda X a 4 Mb/s.',
        };
      }
      case 'downlink': {
        const activeObs = snapshot.observations.find((o) => !o.transmitted);
        if (activeObs && !activeObs.requested) {
          return {
            actorRole: 'ground' as PlayerRole,
            stationId: 'antenna' as StationId,
            title: 'Autorizar Telemetría',
            description: 'La Base CNOIS debe autorizar la bajada de telemetría hacia Punta Hermosa.',
          };
        }
        return {
          actorRole: 'satellite' as PlayerRole,
          stationId: 'antenna' as StationId,
          title: 'Transmitir Banda X (8.2 GHz)',
          description: 'El Satélite PerúSAT-1 debe transmitir los datos por antena Banda X a 4 Mb/s.',
        };
      }
      case 'review': {
        const hasUnclassified = snapshot.observations.some((o) => o.transmitted && !o.finding);
        if (hasUnclassified) {
          return {
            actorRole: 'ground' as PlayerRole,
            stationId: 'report' as StationId,
            title: 'Clasificar Imagen Científica',
            description: 'La Base CNOIS debe analizar la evidencia óptica recibida y registrar el hallazgo.',
          };
        }
        const validCount = snapshot.observations.filter(isEvidence).length;
        const reqCount = scenarioMode === 'emergency' ? 1 : 2;
        if (validCount < reqCount) {
          return {
            actorRole: 'ground' as PlayerRole,
            stationId: 'base' as StationId,
            title: 'Solicitar 2da Cuenca (Río Chira)',
            description: 'El protocolo exige corroborar al menos 2 cuencas antes de emitir el informe final.',
          };
        }
        return {
          actorRole: 'ground' as PlayerRole,
          stationId: 'report' as StationId,
          title: 'Emitir Informe Oficial ante COEN',
          description: 'La Base CNOIS puede consolidar y remitir el informe oficial de situación simulado.',
        };
      }
      case 'debrief':
        return {
          actorRole: 'ground' as PlayerRole,
          stationId: 'report' as StationId,
          title: 'Ver Informe Final y Rúbrica',
          description: 'Misión concluida con éxito. Revisa el balance ético, técnico y la evaluación.',
        };
    }
  };
  const stepInfo = getRequiredStepInfo();

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
        return hasPendingObservations ? 'Transmitir por Antena' : 'Clasificar Evidencia Óptica';
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

      {/* Selector de Modo de Visualización y Banner de Tarea Activa */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/80 p-1.5 rounded-lg border border-slate-800 text-xs font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 font-bold">Vista:</span>
          <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800">
            <button
              onClick={() => {
                soundManager.playClick();
                setSceneMode('cabin');
              }}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                sceneMode === 'cabin'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Vista pixel art clásica con todas las consolas en pantalla (Original UX/UI)"
            >
              🕹️ Cabina Vintage
            </button>
            <button
              onClick={() => {
                soundManager.playClick();
                setSceneMode('explorable');
              }}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all ${
                sceneMode === 'explorable'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Mundo interactivo 2D: Camina con WASD por las 5 salas de la base y pulsa [E] para operar consolas"
            >
              🚶 Base Espacial 2D (5 Salas)
            </button>
            <button
              onClick={() => {
                soundManager.playClick();
                setIsZoomOpen(true);
              }}
              className="px-2.5 py-1 rounded text-xs font-bold transition-all bg-indigo-950/80 hover:bg-indigo-800 text-cyan-300 border border-indigo-700/80 flex items-center gap-1.5 shadow-sm"
              title="Secuencia cinemática: Órbita terrestre -> Sudamérica -> Perú -> Cuenca del Río Piura"
            >
              <span>🛰️</span>
              <span>Órbita & Zoom Piura</span>
            </button>
          </div>
        </div>

        {/* Indicador de siguiente estación recomendada */}
        <div className="flex items-center gap-1 text-[11px] text-slate-300">
          <span className="text-cyan-400 font-bold">Próxima Consola:</span>
          <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800 text-cyan-300 font-bold">
            {stepInfo.title}
          </span>
        </div>
      </div>

      {/* Banner de Ayuda Didáctica y Cambio Rápido de Rol en Modo Local */}
      {!isMultiplayer && role !== stepInfo.actorRole && (
        <div className="bg-amber-950/90 border-2 border-amber-400 p-2.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs font-mono shadow-xl animate-pulse">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <div>
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <span>Turno requerido:</span>
                <span className="px-1.5 py-0.2 rounded bg-amber-900/80 text-amber-200 border border-amber-600">
                  {stepInfo.actorRole === 'ground' ? '📡 Base CNOIS (Tierra)' : '🛰️ Satélite PerúSAT-1 (Órbita)'}
                </span>
              </div>
              <p className="text-slate-300 text-[11px] mt-0.5">{stepInfo.description}</p>
            </div>
          </div>
          <button
            onClick={() => {
              soundManager.playClick();
              onRoleChange?.(stepInfo.actorRole);
            }}
            className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg shadow-md transition-all transform active:scale-95 whitespace-nowrap ml-auto"
            title={`Cambiar control a ${stepInfo.actorRole === 'ground' ? 'Base CNOIS' : 'PerúSAT-1'}`}
          >
            🔄 Cambiar a {stepInfo.actorRole === 'ground' ? 'Base CNOIS' : 'PerúSAT-1'} (1 Clic)
          </button>
        </div>
      )}

      {/* 2. Escenario Principal: Cabina Phaser o Mundo Explorable */}
      <div className="cabin-frame relative rounded-lg border-2 border-blue-900/80 overflow-hidden shadow-2xl">
        {/* Escena interactiva Phaser 4 */}
        <PhaserGame sceneMode={sceneMode} />

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
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider font-mono">
                      Consola Geográfica · Base CNOIS (Pucusana)
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      Órbita LEO / Cartografía
                    </span>
                  </div>

                  {/* Selector / Breadcrumb de aproximación geográfica (Tierra -> Sudamérica -> Perú -> Piura -> Cuenca) */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-2 border-b border-slate-800 mb-3 text-[10px] font-mono">
                    {[
                      { id: 'earth', label: '1. Tierra' },
                      { id: 'south_america', label: '2. Sudamérica' },
                      { id: 'peru', label: '3. Perú' },
                      { id: 'piura', label: '4. Piura' },
                      { id: 'target_basin', label: '5. Cuenca Objetivo' },
                    ].map((step) => (
                      <button
                        key={step.id}
                        onClick={() => {
                          soundManager.playClick();
                          setGeoStage(step.id as any);
                        }}
                        className={`px-2 py-0.5 rounded transition-all whitespace-nowrap ${
                          geoStage === step.id
                            ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                            : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        {step.label}
                      </button>
                    ))}
                  </div>

                  {/* Etapa 1: Tierra (Órbita Global LEO) */}
                  {geoStage === 'earth' && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="relative border border-cyan-800/60 bg-slate-950 p-4 rounded-xl flex flex-col items-center justify-center min-h-[200px] overflow-hidden">
                        <div className="w-36 h-36 rounded-full bg-gradient-to-tr from-blue-950 via-blue-800 to-cyan-700 border-2 border-cyan-400 shadow-[0_0_40px_rgba(7,216,248,0.35)] relative overflow-hidden flex items-center justify-center">
                          <div className="absolute w-20 h-28 bg-emerald-600/70 rounded-full rotate-12 blur-[1px] translate-x-2 translate-y-1 border border-emerald-400/40" />
                          <div className="absolute inset-0 bg-white/20 rounded-full mix-blend-overlay animate-pulse" />
                          <div className="absolute top-3 right-4 flex items-center gap-1 animate-bounce">
                            <span className="text-xs">🛰️</span>
                            <span className="text-[7.5px] font-mono text-cyan-300 bg-slate-950/90 px-1 rounded border border-cyan-500/50">
                              PerúSAT-1 (SSO)
                            </span>
                          </div>
                        </div>
                        <div className="absolute w-56 h-56 rounded-full border border-dashed border-cyan-500/40 pointer-events-none rotate-45" />
                      </div>
                      <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg text-xs font-mono space-y-1">
                        <div className="text-cyan-400 font-bold">1. ÓRBITA GLOBAL LEO · ALTITUD 673 KM (SSO)</div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          Vigilancia remota del Pacífico oriental. El sensor óptico NAOMI y la Base CNOIS inician el monitoreo
                          satelital ante anomalías de temperatura marina asociadas al Fenómeno de El Niño.
                        </p>
                      </div>
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => {
                            soundManager.playClick();
                            setGeoStage('south_america');
                          }}
                          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs rounded shadow"
                        >
                          Avanzar a Continente Sudamericano →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Etapa 2: Sudamérica */}
                  {geoStage === 'south_america' && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="relative border border-cyan-800/60 bg-slate-950 p-4 rounded-xl flex flex-col items-center justify-center min-h-[200px] overflow-hidden">
                        <div className="w-44 h-48 bg-slate-900 border border-cyan-600/50 rounded-2xl relative p-3 flex items-center justify-center overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/30 via-emerald-900/20 to-blue-950/50" />
                          <div className="absolute left-6 top-6 bottom-6 w-3 bg-amber-900/40 border-r border-amber-500/40 transform -skew-x-6" />
                          <div className="absolute left-10 top-16 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
                            <span className="text-[9px] font-mono font-bold text-cyan-300 bg-slate-950/90 px-1.5 py-0.5 rounded border border-cyan-500">
                              PERÚ
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg text-xs font-mono space-y-1">
                        <div className="text-cyan-400 font-bold">2. CONTINENTE SUDAMERICANO · FRENTE ITCZ</div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          La Zona de Convergencia Intertropical (ITCZ) desplaza masas húmedas hacia la vertiente occidental
                          de los Andes. Riesgo de lluvias torrenciales en la cuenca del Pacífico.
                        </p>
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <button
                          onClick={() => {
                            soundManager.playClick();
                            setGeoStage('earth');
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs rounded border border-slate-700"
                        >
                          ← Volver a Tierra
                        </button>
                        <button
                          onClick={() => {
                            soundManager.playClick();
                            setGeoStage('peru');
                          }}
                          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs rounded shadow"
                        >
                          Avanzar a Territorio Peruano →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Etapa 3: Perú */}
                  {geoStage === 'peru' && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="relative border border-cyan-800/60 bg-slate-950 p-3 rounded-xl flex flex-col items-center justify-center min-h-[200px] overflow-hidden">
                        <svg viewBox="0 0 200 220" className="w-48 h-48 text-cyan-400 fill-cyan-950/30 stroke-current stroke-2">
                          <polygon points="40,25 75,18 120,35 155,75 140,130 150,175 115,200 75,185 45,150 28,100 28,55" />
                          <path d="M 40,25 Q 28,75 45,150 Q 75,185 115,200" fill="none" stroke="#ffb02e" strokeWidth="2.5" />
                        </svg>
                        <div className="absolute left-16 top-10 flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping" />
                          <span className="text-[9px] font-mono font-bold text-amber-300 bg-slate-950/90 px-1.5 py-0.5 rounded border border-amber-500">
                            📍 ZONA ALERTA (PIURA)
                          </span>
                        </div>
                        <div className="absolute left-24 top-28 flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" />
                          <span className="text-[8px] font-mono text-cyan-200 bg-slate-950/90 px-1 rounded">
                            CNOIS (Pucusana)
                          </span>
                        </div>
                      </div>
                      <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg text-xs font-mono space-y-1">
                        <div className="text-cyan-400 font-bold">3. REPÚBLICA DEL PERÚ · COBERTURA CNOIS</div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          El Centro CNOIS activa el protocolo de emergencia por inundaciones en la costa norte. Cobertura
                          del territorio nacional y programación de ventana de pase sobre Piura.
                        </p>
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <button
                          onClick={() => {
                            soundManager.playClick();
                            setGeoStage('south_america');
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs rounded border border-slate-700"
                        >
                          ← Volver a Sudamérica
                        </button>
                        <button
                          onClick={() => {
                            soundManager.playClick();
                            setGeoStage('piura');
                          }}
                          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold text-xs rounded shadow"
                        >
                          Focalizar Departamento de Piura →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Etapa 4: Piura */}
                  {geoStage === 'piura' && (
                    <div className="space-y-3 animate-fadeIn">
                      <div className="relative border border-amber-600/60 bg-slate-950 p-4 rounded-xl flex flex-col items-center justify-center min-h-[200px] overflow-hidden">
                        <div className="w-full h-40 bg-slate-900 rounded-lg border border-cyan-800/80 relative overflow-hidden p-3 flex flex-col justify-between">
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-amber-400 font-bold">DEPARTAMENTO DE PIURA · COSTA NORTE</span>
                            <span className="text-slate-400">ALERTA ROJA INDECI</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 my-1">
                            <div className="p-2 bg-slate-950/80 rounded border border-cyan-700 font-mono text-[10px]">
                              <div className="text-cyan-400 font-bold">Valle del Río Chira</div>
                              <div className="text-slate-400">Sullana · Terrazas Agrícolas</div>
                            </div>
                            <div className="p-2 bg-slate-950/80 rounded border border-amber-600 font-mono text-[10px]">
                              <div className="text-amber-400 font-bold">Cuenca del Río Piura</div>
                              <div className="text-slate-400">Catacaos · Puente Sánchez Cerro</div>
                            </div>
                          </div>
                          <div className="text-[9.5px] font-mono text-slate-400">
                            Precipitación acumulada estimada por NASA GPM/IMERG: &gt;120 mm en 24h.
                          </div>
                        </div>
                      </div>
                      <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg text-xs font-mono space-y-1">
                        <div className="text-amber-400 font-bold">4. DEPARTAMENTO DE PIURA · CUENCAS EN VULNERABILIDAD</div>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          La cuenca baja del río Piura y los valles del río Chira presentan riesgo inminente de desborde.
                          El protocolo exige seleccionar la cuenca prioritaria para adquisición óptica submétrica.
                        </p>
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <button
                          onClick={() => {
                            soundManager.playClick();
                            setGeoStage('peru');
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs rounded border border-slate-700"
                        >
                          ← Volver a Perú
                        </button>
                        <button
                          onClick={() => {
                            soundManager.playClick();
                            setGeoStage('target_basin');
                          }}
                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-xs rounded shadow"
                        >
                          Seleccionar Cuenca Objetivo →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Etapa 5: Cuenca Fluvial Objetivo & Solicitud */}
                  {geoStage === 'target_basin' && (
                    <div className="animate-fadeIn">
                      <div className="text-xs text-slate-300 mb-2 font-mono">
                        Selecciona el río prioritario para monitoreo de crecida:
                      </div>

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

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          onClick={() => {
                            soundManager.playClick();
                            setGeoStage('piura');
                          }}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs rounded border border-slate-700"
                        >
                          ← Volver a Piura
                        </button>

                        {!isMultiplayer && role !== 'ground' && (
                          <button
                            onClick={() => {
                              soundManager.playClick();
                              onRoleChange?.('ground');
                            }}
                            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs rounded shadow"
                            title="Cambiar control a Base CNOIS"
                          >
                            🔄 Cambiar a Base CNOIS (1 Clic)
                          </button>
                        )}
                        <div className="flex justify-end gap-2 ml-auto">
                          <button
                            onClick={handleRequestObservation}
                            disabled={
                              role !== 'ground' ||
                              (snapshot.phase !== 'briefing' && snapshot.phase !== 'review') ||
                              isDispatching
                            }
                            title={role !== 'ground' ? 'Solo la Base CNOIS puede solicitar observaciones' : 'Enviar solicitud al satélite'}
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
                    </div>
                  )}
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

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {!isMultiplayer && role !== 'satellite' && (
                          <button
                            onClick={() => {
                              soundManager.playClick();
                              onRoleChange?.('satellite');
                            }}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-xs rounded shadow"
                            title="Cambiar control a Satélite PerúSAT-1"
                          >
                            🔄 Cambiar a Satélite (1 Clic)
                          </button>
                        )}
                        <div className="flex justify-end gap-2 ml-auto">
                          <button
                            onClick={handleApprovePlan}
                            disabled={role !== 'satellite' || snapshot.phase !== 'planning'}
                            title={role !== 'satellite' ? 'Solo el Satélite puede aprobar el plan' : 'Aprobar plan'}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs rounded shadow"
                          >
                            {role === 'satellite' ? 'Aprobar Plan y Configurar Sensor →' : 'Solo Satélite aprueba'}
                          </button>
                        </div>
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

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {!isMultiplayer && role !== 'satellite' && (
                          <button
                            onClick={() => {
                              soundManager.playClick();
                              onRoleChange?.('satellite');
                            }}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-xs rounded shadow"
                            title="Cambiar control a Satélite PerúSAT-1"
                          >
                            🔄 Cambiar a Satélite (1 Clic)
                          </button>
                        )}
                        <div className="flex justify-end gap-2 ml-auto">
                          <button
                            onClick={handleCaptureImage}
                            disabled={
                              role !== 'satellite' ||
                              snapshot.phase !== 'capture' ||
                              Math.abs(aimValue - 66) > 6
                            }
                            title={
                              role !== 'satellite'
                                ? 'Solo el Satélite puede operar la cámara NAOMI'
                                : Math.abs(aimValue - 66) > 6
                                ? 'Alinea la mira con la marca cian antes de disparar'
                                : 'Disparar sensor óptico NAOMI'
                            }
                            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs rounded shadow"
                          >
                            Disparar Cámara NAOMI 📸
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeModal === 'antenna' && (
                <div>
                  <div className="text-[11px] text-amber-400 font-bold uppercase tracking-wider">
                    Terminal de Enlace · Banda X (8.20 GHz)
                  </div>
                  <h3>Transmisión de Datos a Tierra</h3>
                  <p className="text-xs text-slate-300 mb-3">
                    Sintoniza la frecuencia a 8.20 GHz (Banda X) para iniciar la bajada de telemetría hacia Punta Hermosa.
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
                      <span className="text-amber-300">4.0 Mb/s (Banda X satelital)</span>
                    </div>
                  </div>

                  <div className="space-y-1 mb-4 font-mono text-xs">
                    <label className="text-slate-300 flex justify-between">
                      <span>Frecuencia de Enlace:</span>
                      <span className={Math.abs(radioFreq - 8.2) < 0.02 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        {radioFreq.toFixed(2)} GHz {Math.abs(radioFreq - 8.2) < 0.02 ? '✓ Sintonizada' : '(Ajusta a 8.20 GHz)'}
                      </span>
                    </label>
                    <input
                      type="range"
                      min="8.0"
                      max="8.4"
                      step="0.05"
                      value={radioFreq}
                      onChange={(e) => setRadioFreq(Number(e.target.value))}
                      className="w-full accent-amber-400"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {/* Botón de cambio de rol si el jugador local tiene el rol opuesto */}
                    {!isMultiplayer && (
                      <div>
                        {(() => {
                          const activeObs =
                            snapshot.observations.find((o) => !o.transmitted) ||
                            snapshot.observations[snapshot.observations.length - 1];

                          if (activeObs && !activeObs.requested && role !== 'ground') {
                            return (
                              <button
                                onClick={() => {
                                  soundManager.playClick();
                                  onRoleChange?.('ground');
                                }}
                                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs rounded shadow"
                                title="Cambiar a Base CNOIS para solicitar la bajada"
                              >
                                🔄 Cambiar a Base CNOIS (1 Clic)
                              </button>
                            );
                          }

                          if (activeObs && activeObs.requested && !activeObs.transmitted && role !== 'satellite') {
                            return (
                              <button
                                onClick={() => {
                                  soundManager.playClick();
                                  onRoleChange?.('satellite');
                                }}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-mono font-bold text-xs rounded shadow"
                                title="Cambiar a Satélite PerúSAT-1 para transmitir el archivo"
                              >
                                🔄 Cambiar a Satélite (1 Clic)
                              </button>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    )}

                    <div className="flex justify-end gap-2 ml-auto">
                      {(() => {
                        const activeObs =
                          snapshot.observations.find((o) => !o.transmitted) ||
                          snapshot.observations[snapshot.observations.length - 1];

                        if (activeObs && !activeObs.requested) {
                          return (
                            <button
                              onClick={handleRequestTransmission}
                              disabled={role !== 'ground' || isDispatching}
                              title={role !== 'ground' ? 'Solo la Base CNOIS puede autorizar la descarga' : 'Autorizar descarga de telemetría'}
                              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs rounded shadow"
                            >
                              {role === 'ground'
                                ? 'Solicitar Telemetría (Base CNOIS) 📡'
                                : 'Aguardando solicitud de la Base'}
                            </button>
                          );
                        }

                        if (activeObs && activeObs.transmitted) {
                          return (
                            <button
                              onClick={() => {
                                soundManager.playClick();
                                if (!isMultiplayer && role !== 'ground') {
                                  onRoleChange?.('ground');
                                }
                                setActiveModal('report');
                              }}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs rounded shadow flex items-center gap-1.5"
                              title="Telemetría recibida en tierra. Ir a Centro de Análisis para clasificar la imagen."
                            >
                              <span>✓ Telemetría Recibida</span>
                              <span>·</span>
                              <span>Ir a Clasificar en Centro de Análisis →</span>
                            </button>
                          );
                        }

                        return (
                          <button
                            onClick={handleTransmitObservation}
                            disabled={
                              role !== 'satellite' ||
                              Math.abs(radioFreq - 8.2) >= 0.02 ||
                              !activeObs ||
                              activeObs.transmitted ||
                              isDispatching
                            }
                            title={
                              role !== 'satellite'
                                ? 'Solo el Satélite puede transmitir por antena'
                                : Math.abs(radioFreq - 8.2) >= 0.02
                                ? 'Ajusta la frecuencia a 8.20 GHz en Banda X antes de transmitir'
                                : 'Transmitir telemetría por antena Banda X'
                            }
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-mono font-bold text-xs rounded shadow"
                          >
                            {role === 'satellite'
                              ? 'Transmitir por Antena Banda X 📡'
                              : 'Aguardando enlace de Satélite'}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {activeModal === 'report' && (
                <div>
                  <div className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider">
                    Centro de Análisis · CNOIS
                  </div>
                  <h3>
                    {snapshot.phase === 'review' || hasUnclassifiedObservations
                      ? 'Evaluación de Evidencia Satelital'
                      : 'Informe de Situación Simulado'}
                  </h3>

                  {snapshot.phase === 'review' || hasUnclassifiedObservations ? (
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

              {/* Modal Sala Briefing: Fundamentos Científicos NASA IMERG & Protocolo */}
              {activeModal === 'briefing' && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <div className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider">
                        Sala 03 · Mesa Táctica de Briefing Científico
                      </div>
                      <h3 className="text-sm font-bold text-white">Simulación NASA GPM/IMERG & Operaciones PerúSAT-1</h3>
                    </div>
                    <span className="text-[10px] bg-cyan-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800">
                      NASA Space Apps 2026
                    </span>
                  </div>

                  <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl space-y-2">
                    <div className="text-cyan-300 font-bold flex items-center gap-1.5">
                      <span>🛰️</span>
                      <span>Contexto Operativo: Fenómeno de El Niño Costero</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      El calentamiento anómalo del mar frente a la costa norte peruana genera frentes convectivos de alta intensidad.
                      La constelación multisatélite NASA GPM / IMERG V07 detecta tasas de precipitación superiores a 40 mm/h.
                      Esta información orienta la prioridad espacial pero requiere verificación óptica submétrica de PerúSAT-1.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-cyan-700/60">
                      <div className="text-cyan-400 font-bold mb-1">🎮 Operador de Tierra (Base CNOIS)</div>
                      <ul className="list-disc list-inside text-slate-300 space-y-1">
                        <li>Focaliza la cuenca en la consola cartográfica.</li>
                        <li>Autoriza enlace de telemetría a Punta Hermosa.</li>
                        <li>Fotointerpreta la escena y emite el dictamen al COEN.</li>
                      </ul>
                    </div>
                    <div className="p-2.5 bg-slate-950 rounded-lg border border-amber-600/60">
                      <div className="text-amber-400 font-bold mb-1">🛰️ Operador de Satélite (PerúSAT-1)</div>
                      <ul className="list-disc list-inside text-slate-300 space-y-1">
                        <li>Calibra la resolución del sensor NAOMI (0.7m Pan / 2.8m MS).</li>
                        <li>Alinea la mira orbital y dispara en la ventana de pase.</li>
                        <li>Sintoniza la frecuencia 8.2 GHz (Banda X) a 4 Mb/s.</li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => {
                        soundManager.playClick();
                        setActiveModal(null);
                      }}
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded shadow"
                    >
                      Entendido · Volver a la Base
                    </button>
                  </div>
                </div>
              )}

              {/* Modal Sala Debrief: Certificación Final */}
              {activeModal === 'debrief' && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <div className="text-[11px] text-emerald-400 font-bold uppercase tracking-wider">
                        Sala 04 · Consola de Certificación Final
                      </div>
                      <h3 className="text-sm font-bold text-white">Evaluación y Balance de Misión</h3>
                    </div>
                    <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800">
                      {snapshot.phase === 'debrief' ? 'Misión Concluida' : 'En Progreso'}
                    </span>
                  </div>

                  {snapshot.phase === 'debrief' ? (
                    <div>
                      <FinalMissionReport
                        snapshot={snapshot}
                        finding={selectedFinding}
                        appliedEvents={gateway.getAppliedEvents ? gateway.getAppliedEvents(snapshot.roomId) : []}
                      />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl space-y-2">
                        <div className="text-amber-400 font-bold">Estado Preliminar de Operaciones</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-[10px]">
                          <div className="p-2 bg-slate-950 rounded border border-slate-800">
                            <div className="text-slate-400">Fase</div>
                            <div className="text-cyan-400 font-bold uppercase">{snapshot.phase}</div>
                          </div>
                          <div className="p-2 bg-slate-950 rounded border border-slate-800">
                            <div className="text-slate-400">Evidencias</div>
                            <div className="text-emerald-400 font-bold">{usefulEvidence} / {requiredEvidence}</div>
                          </div>
                          <div className="p-2 bg-slate-950 rounded border border-slate-800">
                            <div className="text-slate-400">Batería</div>
                            <div className="text-cyan-400 font-bold">{snapshot.resources.energyWh} Wh</div>
                          </div>
                          <div className="p-2 bg-slate-950 rounded border border-slate-800">
                            <div className="text-slate-400">Contacto</div>
                            <div className="text-amber-400 font-bold">{snapshot.resources.contactSeconds} s</div>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed pt-1">
                          La certificación final se desbloquea tras completar la adquisición, descarga y análisis oficial
                          en el Centro de Análisis.
                        </p>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => {
                            soundManager.playClick();
                            setActiveModal(null);
                          }}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded border border-slate-700"
                        >
                          Volver a Operaciones
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Modal Lobby Central: Directorio de la Base y Estado */}
              {activeModal === 'lobby' && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <div className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider">
                        Lobby Central · Distribuidor de la Base Espacial
                      </div>
                      <h3 className="text-sm font-bold text-white">Directorio Operativo CNOIS & PerúSAT-1</h3>
                    </div>
                    <span className="text-[10px] bg-slate-950 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800">
                      5 Salas Interconectadas
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10.5px]">
                    <button
                      onClick={() => {
                        soundManager.playClick();
                        setActiveModal('base');
                      }}
                      className="p-2.5 bg-slate-900 hover:bg-slate-800 rounded-lg border border-cyan-700/60 text-left transition-colors"
                    >
                      <div className="text-cyan-400 font-bold flex items-center gap-1.5">
                        <span>▤</span>
                        <span>Oeste: Base CNOIS (Sala 01)</span>
                      </div>
                      <div className="text-slate-400 text-[10px] mt-0.5">
                        Consola Geográfica · Zoom Tierra a Piura y solicitud de captura.
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        soundManager.playClick();
                        setActiveModal('camera');
                      }}
                      className="p-2.5 bg-slate-900 hover:bg-slate-800 rounded-lg border border-amber-600/60 text-left transition-colors"
                    >
                      <div className="text-amber-400 font-bold flex items-center gap-1.5">
                        <span>⊙</span>
                        <span>Este: Enlace Satélite · Óptica (Sala 02)</span>
                      </div>
                      <div className="text-slate-400 text-[10px] mt-0.5">
                        Sensor NAOMI · Calibración, retícula y disparo satelital.
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        soundManager.playClick();
                        setActiveModal('antenna');
                      }}
                      className="p-2.5 bg-slate-900 hover:bg-slate-800 rounded-lg border border-cyan-700/60 text-left transition-colors"
                    >
                      <div className="text-cyan-400 font-bold flex items-center gap-1.5">
                        <span>⌁</span>
                        <span>Este: Terminal Banda X (Sala 02)</span>
                      </div>
                      <div className="text-slate-400 text-[10px] mt-0.5">
                        Descarga de imágenes a 8.2 GHz y telemetría a Punta Hermosa.
                      </div>
                    </button>

                    <button
                      onClick={() => {
                        soundManager.playClick();
                        setActiveModal('report');
                      }}
                      className="p-2.5 bg-slate-900 hover:bg-slate-800 rounded-lg border border-emerald-600/60 text-left transition-colors"
                    >
                      <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                        <span>≡</span>
                        <span>Oeste: Centro de Análisis (Sala 01)</span>
                      </div>
                      <div className="text-slate-400 text-[10px] mt-0.5">
                        Clasificación de inundación y dictamen oficial COEN.
                      </div>
                    </button>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => {
                        soundManager.playClick();
                        setActiveModal(null);
                      }}
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded shadow"
                    >
                      Continuar Exploración
                    </button>
                  </div>
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

      {/* Barra de Ayuda para Controles de Exploración 2D */}
      {sceneMode === 'explorable' && (
        <div className="bg-emerald-950/70 border border-emerald-700/60 rounded px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-emerald-300">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🎮</span>
            <span>
              <strong>Controles 2D:</strong> [W][A][S][D] o Flechas para moverte · Camina hacia las puertas laterales para cambiar de sala · Pulsa [E] o haz clic en consolas para operar.
            </span>
          </div>
          <span className="text-emerald-400 font-bold bg-emerald-900/60 px-2 py-0.5 rounded">
            Fase 1: Prototipo 2 Salas
          </span>
        </div>
      )}

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

      {/* Visor Cinemático Orbital: Tierra -> Sudamérica -> Perú -> Piura */}
      {isZoomOpen && (
        <EarthToPiuraZoom
          onClose={() => setIsZoomOpen(false)}
          onProceedToCapture={() => {
            if (!isMultiplayer && role !== 'satellite') {
              onRoleChange?.('satellite');
            }
            setActiveModal('camera');
          }}
        />
      )}
    </div>
  );
};
