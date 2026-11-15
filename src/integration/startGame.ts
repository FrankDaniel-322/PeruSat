import { AUTO, Game } from 'phaser';
import { BridgeScene } from './BridgeScene';

export function startGame(parent: HTMLElement): Game {
  return new Game({
    type: AUTO,
    width: 480,
    height: 300,
    parent,
    backgroundColor: '#082638',
    scene: [BridgeScene],
  });
}
