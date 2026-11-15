import { Scene } from 'phaser';
import { missionBridge } from './missionBridge';

/** Temporary integration scene; Role 02 can replace it with mission scenes. */
export class BridgeScene extends Scene {
  private cleanupBridge: (() => void) | null = null;
  private targetLabel: Phaser.GameObjects.Text | null = null;

  constructor() { super('BridgeScene'); }

  create(): void {
    this.add.text(20, 20, 'Phaser · puente de integración', { color: '#ffffff', fontSize: '18px' });
    const target = this.add.rectangle(240, 150, 280, 110, 0x145b83).setInteractive();
    this.targetLabel = this.add.text(135, 138, 'Seleccionar Piura', { color: '#ffffff', fontSize: '20px' });
    target.on('pointerdown', () => missionBridge.notifyReact({ kind: 'targetSelected', targetId: 'piura' }));
    this.cleanupBridge = missionBridge.onReactRequest((request) => {
      if (request.kind === 'focusTarget') {
        this.targetLabel?.setText(`Objetivo: ${request.targetId}`);
      }
    });
    this.events.once('shutdown', () => {
      this.cleanupBridge?.();
      this.cleanupBridge = null;
    });
  }
}
