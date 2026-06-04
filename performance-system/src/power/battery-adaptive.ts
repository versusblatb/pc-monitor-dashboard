import { isLowPowerDevice } from '../detection/device-capabilities.js';
import { CleanupRegistry } from '../realtime/cleanup-registry.js';
import type { PowerMode } from '../platform/types.js';
import type { AdaptiveFeatures, PerformanceTier } from '../types.js';

export interface BatteryAdaptiveOptions {
  onModeChange?: (mode: PowerMode) => void;
  pollIntervalMs?: number;
}

/**
 * Adaptive battery mode: reduces animations, WS frequency, charts, DOM churn.
 */
export class BatteryAdaptiveMode {
  private mode: PowerMode = 'normal';
  private readonly cleanup = new CleanupRegistry();
  private readonly listeners = new Set<(mode: PowerMode) => void>();

  constructor(private readonly options: BatteryAdaptiveOptions = {}) {}

  async init(): Promise<PowerMode> {
    await this.evaluate();
    this.cleanup.registerInterval(
      () => void this.evaluate(),
      this.options.pollIntervalMs ?? 30_000,
    );
    return this.mode;
  }

  getMode(): PowerMode {
    return this.mode;
  }

  subscribe(fn: (mode: PowerMode) => void): () => void {
    this.listeners.add(fn);
    fn(this.mode);
    return () => this.listeners.delete(fn);
  }

  /** Force lite-tier feature overrides when on battery. */
  applyToFeatures(features: AdaptiveFeatures, _tier: PerformanceTier): AdaptiveFeatures {
    if (this.mode !== 'battery') return features;

    return {
      ...features,
      heavyAnimations: false,
      advancedCharts: false,
      glowEffects: false,
      animatedGradients: false,
      minimizeDomUpdates: true,
      animationFps: Math.min(features.animationFps, 24),
      realtime: {
        ...features.realtime,
        websocketIntervalMs: Math.max(features.realtime.websocketIntervalMs, 4000),
        chartUpdateIntervalMs: Math.max(features.realtime.chartUpdateIntervalMs, 3000),
        uiAnimationFps: 24,
        animationsEnabled: false,
      },
    };
  }

  shouldForceLiteTier(): boolean {
    return this.mode === 'battery';
  }

  dispose(): void {
    this.cleanup.dispose();
    this.listeners.clear();
  }

  private async evaluate(): Promise<void> {
    const low = await isLowPowerDevice();
    const next: PowerMode = low ? 'battery' : 'normal';
    if (next === this.mode) return;
    this.mode = next;
    this.options.onModeChange?.(next);
    this.listeners.forEach((fn) => fn(next));
  }
}
