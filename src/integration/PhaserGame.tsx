import { useEffect, useRef } from 'react';
import { startGame } from './startGame';

interface PhaserGameProps {
  className?: string;
}

export function PhaserGame({ className }: PhaserGameProps = {}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const game = startGame(container.current);
    return () => {
      game.destroy(true);
    };
  }, []);

  return (
    <div
      ref={container}
      className={className ?? 'w-full h-full flex items-center justify-center'}
      aria-label="Escena interactiva de la cabina PERUSAT CREW en Phaser"
    />
  );
}
