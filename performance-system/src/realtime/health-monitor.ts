import type { RealtimeHealth } from '../types.js';
import { CleanupRegistry } from './cleanup-registry.js';

export interface HealthMonitorOptions {
  fpsThreshold?: number;
  lowFpsWindowMs?: number;
  downgradeDurationMs?: number;
  sampleIntervalMs?: number;
  onDowngrade?: () => void;
  onRecover?: () => void;
}

const DEFAULT_HEALTH: RealtimeHealth = {
  uiFps: 60,
  uiFpsMin: 60,
  networkFps: 0,
  websocketLatencyMs: null,
  memoryPressure: 'unknown',
  lastRenderTimeMs: 0,
  temporarilyDowngraded: false,
  downgradedUntil: null,
  updatedAt: Date.now(),
};

/**
 * Continuous UI FPS + memory + render time; triggers temporary lite downgrade.
 */
export class RealtimeHealthMonitor {
  private health: RealtimeHealth = { ...DEFAULT_HEALTH };
  private readonly cleanup = new CleanupRegistry();
  private readonly listeners = new Set<(h: RealtimeHealth) => void>();

  private readonly fpsThreshold: number;
  private readonly lowFpsWindowMs: number;
  private readonly downgradeDurationMs: number;
  private readonly onDowngrade?: () => void;
  private readonly onRecover?: () => void;

  private rafId = 0;
  private running = false;
  private frameTimes: number[] = [];
  private lowFpsSince = 0;
  private lastFrame = 0;

  constructor(options: HealthMonitorOptions = {}) {
    this.fpsThreshold = options.fpsThreshold ?? 28;
    this.lowFpsWindowMs = options.lowFpsWindowMs ?? 3000;
    this.downgradeDurationMs = options.downgradeDurationMs ?? 45_000;
    this.onDowngrade = options.onDowngrade;
    this.onRecover = options.onRecover;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  getHealth(): RealtimeHealth {
    return this.health;
  }

  subscribe(listener: (h: RealtimeHealth) => void): () => void {
    this.listeners.add(listener);
    listener(this.health);
    return () => this.listeners.delete(listener);
  }

  recordNetworkFps(fps: number): void {
    this.patch({ networkFps: fps });
  }

  recordWebSocketLatency(ms: number): void {
    this.patch({ websocketLatencyMs: ms });
  }

  recordRenderTime(ms: number): void {
    this.patch({ lastRenderTimeMs: ms });
  }

  isTemporarilyDowngraded(): boolean {
    if (!this.health.temporarilyDowngraded) return false;
    if (
      this.health.downgradedUntil != null &&
      Date.now() > this.health.downgradedUntil
    ) {
      this.clearDowngrade();
      return false;
    }
    return true;
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
    this.cleanup.dispose();
  }

  private loop = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const delta = now - this.lastFrame;
    this.lastFrame = now;

    if (delta > 0 && delta < 500) {
      this.frameTimes.push(delta);
      if (this.frameTimes.length > 120) this.frameTimes.shift();
    }

    if (this.frameTimes.length >= 30) {
      const fpsValues = this.frameTimes.map((d) => 1000 / d);
      const avg = fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length;
      const min = Math.min(...fpsValues);

      this.patch({
        uiFps: Math.round(avg * 10) / 10,
        uiFpsMin: Math.round(min * 10) / 10,
        memoryPressure: readMemoryPressure(),
      });

      if (avg < this.fpsThreshold) {
        if (this.lowFpsSince === 0) this.lowFpsSince = now;
        else if (now - this.lowFpsSince >= this.lowFpsWindowMs) {
          this.triggerDowngrade();
        }
      } else {
        this.lowFpsSince = 0;
      }
    }

    this.rafId = requestAnimationFrame(this.loop);
  };

  private triggerDowngrade(): void {
    if (this.health.temporarilyDowngraded) return;

    const until = Date.now() + this.downgradeDurationMs;
    this.patch({
      temporarilyDowngraded: true,
      downgradedUntil: until,
    });
    this.onDowngrade?.();

    this.cleanup.registerTimeout(() => {
      if (Date.now() >= until) this.clearDowngrade();
    }, this.downgradeDurationMs);
  }

  private clearDowngrade(): void {
    if (!this.health.temporarilyDowngraded) return;
    this.patch({
      temporarilyDowngraded: false,
      downgradedUntil: null,
    });
    this.onRecover?.();
  }

  private patch(partial: Partial<RealtimeHealth>): void {
    this.health = { ...this.health, ...partial, updatedAt: Date.now() };
    this.listeners.forEach((fn) => fn(this.health));
  }
}

function readMemoryPressure(): RealtimeHealth['memoryPressure'] {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  };
  const mem = perf.memory;
  if (!mem?.jsHeapSizeLimit) return 'unknown';

  const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
  if (ratio > 0.85) return 'high';
  if (ratio > 0.65) return 'medium';
  return 'low';
}
