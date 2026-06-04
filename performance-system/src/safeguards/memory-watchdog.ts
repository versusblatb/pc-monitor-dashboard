import { CleanupRegistry } from '../realtime/cleanup-registry.js';

export interface MemoryWatchdogOptions {
  checkIntervalMs?: number;
  highWatermarkRatio?: number;
  onPressure?: (level: 'medium' | 'high') => void;
  onRecover?: () => void;
}

/**
 * Monitors JS heap; triggers cache trim + lite recovery on Safari/low-memory.
 */
export class MemoryWatchdog {
  private readonly cleanup = new CleanupRegistry();
  private lastLevel: 'low' | 'medium' | 'high' = 'low';

  constructor(private readonly options: MemoryWatchdogOptions = {}) {}

  start(): void {
    this.cleanup.registerInterval(
      () => this.check(),
      this.options.checkIntervalMs ?? 15_000,
    );
  }

  dispose(): void {
    this.cleanup.dispose();
  }

  private check(): void {
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    };
    const mem = perf.memory;
    if (!mem?.jsHeapSizeLimit) return;

    const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
    const high = this.options.highWatermarkRatio ?? 0.85;

    let level: 'low' | 'medium' | 'high' = 'low';
    if (ratio > high) level = 'high';
    else if (ratio > 0.65) level = 'medium';

    if (level === 'high' && this.lastLevel !== 'high') {
      this.options.onPressure?.('high');
      this.trimCaches();
    } else if (level === 'medium' && this.lastLevel === 'low') {
      this.options.onPressure?.('medium');
    } else if (level === 'low' && this.lastLevel !== 'low') {
      this.options.onRecover?.();
    }

    this.lastLevel = level;
  }

  private trimCaches(): void {
    if (typeof caches === 'undefined') return;
    void caches.keys().then((keys) => {
      keys.slice(0, 3).forEach((k) => void caches.delete(k));
    });
  }
}
