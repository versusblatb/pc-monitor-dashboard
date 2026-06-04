import type { RealtimeConfig } from '../types.js';
import { CleanupRegistry } from './cleanup-registry.js';

export type NetworkFlushHandler<T> = (batch: T[]) => void;
export type UiFlushHandler<T> = (latest: T | null, batch: T[]) => void;

/**
 * Separates network throughput from UI commits.
 * - Network: batches incoming WebSocket payloads by interval.
 * - UI: flushes to React/DOM on rAF capped at uiAnimationFps.
 */
export class SmartUpdateScheduler<T = unknown> {
  private config: RealtimeConfig;
  private networkQueue: T[] = [];
  private latest: T | null = null;
  private lastNetworkFlush = 0;
  private lastChartFlush = 0;
  private lastUiFrame = 0;
  private uiIntervalMs = 1000 / 60;
  private rafId = 0;
  private running = false;

  private readonly networkHandlers = new Set<NetworkFlushHandler<T>>();
  private readonly uiHandlers = new Set<UiFlushHandler<T>>();
  private readonly cleanup = new CleanupRegistry();

  constructor(config?: RealtimeConfig) {
    this.config = config ?? {
      websocketIntervalMs: 1000,
      chartUpdateIntervalMs: 0,
      uiAnimationFps: 60,
      maxChartHistoryPoints: 120,
      chartsPaused: false,
      animationsEnabled: true,
      websocketPaused: false,
    };
    this.uiIntervalMs = this.fpsToMs(this.config.uiAnimationFps);
  }

  setConfig(config: RealtimeConfig): void {
    this.config = config;
    this.uiIntervalMs = this.fpsToMs(config.uiAnimationFps);

    if (config.chartsPaused || !config.animationsEnabled) {
      this.stopUiLoop();
    } else if (this.uiHandlers.size > 0) {
      this.startUiLoop();
    }
  }

  /** Raw WebSocket message — queued, not applied to UI immediately. */
  pushNetworkUpdate(payload: T): void {
    if (this.config.websocketPaused) return;
    this.networkQueue.push(payload);
    this.latest = payload;
    this.maybeFlushNetwork();
  }

  /** Subscribe to batched network window (for Zustand/Redux merge). */
  onNetworkFlush(handler: NetworkFlushHandler<T>): () => void {
    this.networkHandlers.add(handler);
    return () => this.networkHandlers.delete(handler);
  }

  /** Subscribe to rAF UI commits (for React setState / charts). */
  onUiFlush(handler: UiFlushHandler<T>): () => void {
    this.uiHandlers.add(handler);
    if (this.uiHandlers.size === 1) this.startUiLoop();
    return () => {
      this.uiHandlers.delete(handler);
      if (this.uiHandlers.size === 0) this.stopUiLoop();
    };
  }

  getLatest(): T | null {
    return this.latest;
  }

  /** Network messages delivered per second (rolling). */
  getNetworkFps(): number {
    return this.networkFpsCounter.rate;
  }

  start(): void {
    this.running = true;
    this.cleanup.registerInterval(() => this.maybeFlushNetwork(), 50);
  }

  dispose(): void {
    this.running = false;
    this.stopUiLoop();
    this.networkHandlers.clear();
    this.uiHandlers.clear();
    this.networkQueue = [];
    this.cleanup.dispose();
  }

  private fpsToMs(fps: number): number {
    if (fps <= 0) return Infinity;
    return 1000 / fps;
  }

  private maybeFlushNetwork(): void {
    const now = performance.now();
    const interval = this.config.websocketIntervalMs;
    if (now - this.lastNetworkFlush < interval) return;

    this.lastNetworkFlush = now;
    if (this.networkQueue.length === 0) return;

    const batch = this.networkQueue;
    this.networkQueue = [];
    this.networkFpsCounter.tick(batch.length);

    this.networkHandlers.forEach((h) => h(batch));
  }

  private startUiLoop(): void {
    if (this.rafId || !this.running) return;
    if (this.config.chartsPaused || this.uiIntervalMs === Infinity) return;

    const loop = (now: number) => {
      this.rafId = 0;
      if (!this.running || this.uiHandlers.size === 0) return;

      if (now - this.lastUiFrame >= this.uiIntervalMs) {
        this.lastUiFrame = now;
        this.flushUi(now);
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
    this.cleanup.register(() => this.stopUiLoop());
  }

  private stopUiLoop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private flushUi(now: number): void {
    this.maybeFlushNetwork();

    const chartInterval = this.config.chartUpdateIntervalMs;
    const allowChart =
      chartInterval === 0 || now - this.lastChartFlush >= chartInterval;

    if (!allowChart) return;
    this.lastChartFlush = now;

    const latest = this.latest;
    this.uiHandlers.forEach((h) => h(latest, latest ? [latest] : []));
  }

  private networkFpsCounter = createRateCounter();
}

function createRateCounter() {
  let count = 0;
  let windowStart = performance.now();
  let rate = 0;

  return {
    tick(n = 1) {
      count += n;
      const now = performance.now();
      const elapsed = now - windowStart;
      if (elapsed >= 1000) {
        rate = (count * 1000) / elapsed;
        count = 0;
        windowStart = now;
      }
    },
    get rate() {
      return Math.round(rate * 10) / 10;
    },
  };
}
