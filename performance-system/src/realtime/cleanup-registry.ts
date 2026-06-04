export type CleanupFn = () => void;

/**
 * Central registry for dashboard teardown — websockets, timers, rAF, listeners.
 */
export class CleanupRegistry {
  private readonly cleanups = new Set<CleanupFn>();
  private disposed = false;

  register(fn: CleanupFn): () => void {
    if (this.disposed) {
      fn();
      return () => undefined;
    }
    this.cleanups.add(fn);
    return () => this.cleanups.delete(fn);
  }

  registerTimeout(fn: () => void, ms: number): () => void {
    const id = window.setTimeout(fn, ms);
    return this.register(() => clearTimeout(id));
  }

  registerInterval(fn: () => void, ms: number): () => void {
    const id = window.setInterval(fn, ms);
    return this.register(() => clearInterval(id));
  }

  registerAnimationFrame(fn: () => void): () => void {
    const id = requestAnimationFrame(fn);
    return this.register(() => cancelAnimationFrame(id));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const fns = [...this.cleanups].reverse();
    this.cleanups.clear();
    for (const fn of fns) {
      try {
        fn();
      } catch {
        /* teardown must not throw */
      }
    }
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}
