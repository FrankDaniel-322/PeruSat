import type { Finding, MissionAction, MissionSnapshot, PlayerRole } from '../contracts/mission';

export type DemoScenario = 'routine' | 'cloudy';

export interface DemoStep {
  label: string;
  role: PlayerRole;
  explanation: string;
}

export const demoSteps: readonly DemoStep[] = [
  {
    label: 'Solicitar observación', role: 'ground',
    explanation: 'La Base elige una zona de Piura. La solicitud confirmada aparece en ambos puestos.',
  },
  {
    label: 'Aprobar plan', role: 'satellite',
    explanation: 'El operador del satélite aprueba el perfil antes de usar energía o almacenamiento.',
  },
  {
    label: 'Capturar imagen', role: 'satellite',
    explanation: 'La captura es simulada. La calidad puede limitar lo que es responsable concluir.',
  },
  {
    label: 'Pedir transmisión', role: 'ground',
    explanation: 'La imagen está a bordo; la Base debe pedir su envío durante una ventana de contacto.',
  },
  {
    label: 'Transmitir archivo', role: 'satellite',
    explanation: 'La transmisión usa energía y segundos de contacto de la misión didáctica.',
  },
  {
    label: 'Evaluar evidencia', role: 'ground',
    explanation: 'Una imagen nublada no permite sostener una conclusión visual firme.',
  },
  {
    label: 'Emitir informe', role: 'ground',
    explanation: 'El informe distingue un posible hallazgo de evidencia insuficiente.',
  },
];

/** Only builds typed user requests. Mission transitions belong to the injected gateway. */
export function actionForStep(
  index: number,
  snapshot: MissionSnapshot,
  scenario: DemoScenario,
): MissionAction | null {
  const observationId = snapshot.observations.at(-1)?.observationId;
  const finding: Finding = scenario === 'cloudy' ? 'insufficient' : 'possible_flood';
  const common = { actionId: crypto.randomUUID(), expectedRevision: snapshot.revision };
  switch (index) {
    case 0: return { ...common, actorRole: 'ground', type: 'REQUEST_OBSERVATION', payload: { targetId: 'rio-piura' } };
    case 1: return { ...common, actorRole: 'satellite', type: 'APPROVE_PLAN', payload: { profileId: 'optico-demo' } };
    case 2: return { ...common, actorRole: 'satellite', type: 'CAPTURE_IMAGE', payload: { targetId: snapshot.selectedTargetId ?? 'rio-piura' } };
    case 3: return observationId ? { ...common, actorRole: 'ground', type: 'REQUEST_TRANSMISSION', payload: { observationId } } : null;
    case 4: return observationId ? { ...common, actorRole: 'satellite', type: 'TRANSMIT_IMAGE', payload: { observationId } } : null;
    case 5: return observationId ? { ...common, actorRole: 'ground', type: 'CLASSIFY_IMAGE', payload: { observationId, finding } } : null;
    case 6: return { ...common, actorRole: 'ground', type: 'SUBMIT_REPORT', payload: { finding } };
    default: return null;
  }
}
