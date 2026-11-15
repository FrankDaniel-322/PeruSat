import { EventBus } from '../game/EventBus';

export type StationId = 'base' | 'camera' | 'antenna' | 'report' | 'briefing' | 'debrief' | 'lobby';

export type ReactGameRequest =
  | { kind: 'focusTarget'; targetId: string }
  | { kind: 'setActiveStation'; stationId: StationId | null }
  | { kind: 'triggerShutterEffect' }
  | { kind: 'triggerDownlinkEffect' }
  | { kind: 'triggerAlertEffect' };

export type PhaserInteraction =
  | { kind: 'targetSelected'; targetId: string }
  | { kind: 'stationSelected'; stationId: StationId }
  | { kind: 'canvasClicked'; x: number; y: number };

const reactRequestEvent = 'mission:react-request';
const phaserInteractionEvent = 'mission:phaser-interaction';

export const missionBridge = {
  requestGameInteraction(request: ReactGameRequest): void {
    EventBus.emit(reactRequestEvent, request);
  },
  notifyReact(interaction: PhaserInteraction): void {
    EventBus.emit(phaserInteractionEvent, interaction);
  },
  onReactRequest(listener: (request: ReactGameRequest) => void): () => void {
    EventBus.on(reactRequestEvent, listener);
    return () => EventBus.off(reactRequestEvent, listener);
  },
  onPhaserInteraction(listener: (interaction: PhaserInteraction) => void): () => void {
    EventBus.on(phaserInteractionEvent, listener);
    return () => EventBus.off(phaserInteractionEvent, listener);
  },
};
