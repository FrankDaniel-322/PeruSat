import { AUTO, Game, Scale } from 'phaser';
import { ExplorableWorldScene } from './ExplorableWorldScene';
import { StationScene } from './StationScene';

export function startGame(
  parent: HTMLElement,
  initialScene: 'StationScene' | 'ExplorableWorldScene' = 'StationScene',
): Game {
  const game = new Game({
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
    scene: [StationScene, ExplorableWorldScene],
  });

  if (initialScene === 'ExplorableWorldScene') {
    game.events.once('ready', () => {
      game.scene.stop('StationScene');
      game.scene.start('ExplorableWorldScene');
    });
  }

  return game;
}
