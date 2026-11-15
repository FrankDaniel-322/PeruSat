import { useEffect, useRef } from 'react';
import type { Game } from 'phaser';
import { startGame } from './startGame';

interface PhaserGameProps {
  className?: string;
  sceneMode?: 'cabin' | 'explorable';
}

export function PhaserGame({ className, sceneMode = 'cabin' }: PhaserGameProps = {}) {
  const container = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const initial = sceneMode === 'explorable' ? 'ExplorableWorldScene' : 'StationScene';
    const game = startGame(container.current, initial);
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const game = gameRef.current;
    if (!game || !game.scene) return;
    const targetScene = sceneMode === 'explorable' ? 'ExplorableWorldScene' : 'StationScene';
    const otherScene = sceneMode === 'explorable' ? 'StationScene' : 'ExplorableWorldScene';

    if (game.scene.isActive(otherScene)) {
      game.scene.stop(otherScene);
    }
    if (!game.scene.isActive(targetScene)) {
      game.scene.start(targetScene);
    }
  }, [sceneMode]);

  return (
    <div
      ref={container}
      className={className ?? 'w-full h-full flex items-center justify-center'}
      aria-label="Escena interactiva PERUSAT CREW en Phaser"
    />
  );
}
