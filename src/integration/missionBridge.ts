import { EventBus } from '../game/EventBus';

export interface ReactGameRequest {
  kind: 'focusTarget';
  targetId: string;
}

export interface PhaserInteraction {
  kind: 'targetSelected';
  targetId: string;
}

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
