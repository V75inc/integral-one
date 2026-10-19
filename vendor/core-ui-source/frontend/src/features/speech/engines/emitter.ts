/**
 * Minimal event emitter for speech engines.
 *
 * Buffers events until the first listener attaches: an engine may emit
 * (`ready`, an early transcript) before the caller has had a chance to call
 * `session.on(...)` on the session `start()` resolved with.
 */
export interface Emitter<T> {
  on(listener: (event: T) => void): () => void;
  emit(event: T): void;
}

export function createEmitter<T>(): Emitter<T> {
  const listeners = new Set<(event: T) => void>();
  let backlog: T[] | null = [];

  return {
    on(listener) {
      listeners.add(listener);
      if (backlog) {
        const queued = backlog;
        backlog = null;
        for (const event of queued) listener(event);
      }
      return () => {
        listeners.delete(listener);
      };
    },
    emit(event) {
      if (backlog) {
        backlog.push(event);
        return;
      }
      for (const listener of [...listeners]) listener(event);
    },
  };
}
