import { useEffect, useRef } from 'react';
import { startGame } from './startGame';

export function PhaserGame() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const game = startGame(container.current);
    return () => game.destroy(true);
  }, []);
  return <div ref={container} aria-label="Demostración de integración Phaser" />;
}
