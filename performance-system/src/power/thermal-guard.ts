import { CleanupRegistry } from '../realtime/cleanup-registry.js';
import type { PowerMode } from '../platform/types.js';
import type { AdaptiveFeatures } from '../types.js';
import type { RealtimeHealth } from '../types.js';

export interface ThermalGuardOptions {
  /** UI FPS variance threshold (unstable thermal throttle). */
  fpsVarianceThreshold?: number;
  unstableWindowMs?: number;
  cooldownMs?: number;
  onThermal?: (active: boolean) => void;
}

/**
 * Thermal protection: unstable FPS → temporary low-power mode.
 */
export class ThermalGuard {
  private active = false;
  private mode: PowerMode = 'normal';
  private readonly cleanup = new CleanupRegistry();
  private fpsHistory: number[] = [];
  private unstableSince = 0;

  constructor(private readonly options: ThermalGuardOptions = {}) {}

  start(): void {
    this.cleanup.registerInterval(() => this.tick(), 2000);
  }

  ingestHealth(health: RealtimeHealth): void {
    this.fpsHistory.push(health.uiFps);
    if (this.fpsHistory.length > 20) this.fpsHistory.shift();
  }

  getMode(): PowerMode {
    return this.mode;
  }

  isActive(): boolean {
    return this.active;
  }

  applyToFeatures(features: AdaptiveFeatures): AdaptiveFeatures {
    if (!this.active) return features;

    return {
      ...features,
      heavyAnimations: false,
      animationFps: Math.min(features.animationFps, 20),
      minimizeDomUpdates: true,
      realtime: {
        ...features.realtime,
        chartUpdateIntervalMs: Math.max(features.realtime.chartUpdateIntervalMs, 2500),
        uiAnimationFps: 20,
        animationsEnabled: false,
      },
    };
  }

  dispose(): void {
    this.cleanup.dispose();
  }

  private tick(): void {
    if (this.fpsHistory.length < 8) return;

    const avg = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
    const variance =
      this.fpsHistory.reduce((s, v) => s + (v - avg) ** 2, 0) /
      this.fpsHistory.length;

    const threshold = this.options.fpsVarianceThreshold ?? 120;
    const unstable = variance > threshold && avg < 40;

    if (unstable) {
      if (this.unstableSince === 0) this.unstableSince = Date.now();
      const window = this.options.unstableWindowMs ?? 5000;
      if (Date.now() - this.unstableSince >= window) this.activate();
    } else {
      this.unstableSince = 0;
    }
  }

  private activate(): void {
    if (this.active) return;
    this.active = true;
    this.mode = 'thermal';
    this.options.onThermal?.(true);

    const cooldown = this.options.cooldownMs ?? 60_000;
    this.cleanup.registerTimeout(() => {
      this.active = false;
      this.mode = 'normal';
      this.options.onThermal?.(false);
      this.fpsHistory = [];
    }, cooldown);
  }
}
