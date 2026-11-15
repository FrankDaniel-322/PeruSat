type Listener = (...args: any[]) => void;

/**
 * Event emitter isomorfo y ligero para el puente React-Phaser.
 * Compatible con la API de Events.EventEmitter de Phaser (on, off, emit)
 * pero ejecutable tanto en navegador como en Node / pruebas Vitest.
 */
class IsomorphicEventEmitter {
  private listeners: Map<string, Set<Listener>> = new Map();

  on(event: string, fn: Listener): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn);
    return this;
  }

  off(event: string, fn: Listener): this {
    this.listeners.get(event)?.delete(fn);
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return false;
    set.forEach((fn) => {
      try {
        fn(...args);
      } catch (err) {
        console.error('Error in EventBus listener:', err);
      }
    });
    return true;
  }
}

export const EventBus = new IsomorphicEventEmitter();
