import { AUTO, Game, Scale } from 'phaser';
import { StationScene } from './StationScene';

export function startGame(parent: HTMLElement): Game {
  return new Game({
    type: AUTO,
    width: 320,
    height: 180,
    parent,
    pixelArt: true,
    scale: {
      mode: Scale.FIT,
      autoCenter: Scale.CENTER_BOTH,
      width: 320,
      height: 180,
    },
    backgroundColor: '#01143b',
    scene: [StationScene],
  });
}
