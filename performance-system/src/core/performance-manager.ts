import {
  collectDeviceSignals,
  isLowPowerDevice,
  prefersReducedMotion,
} from '../detection/device-capabilities.js';
import { probeFps } from '../detection/fps-probe.js';
import { featuresForTier } from '../modes/features.js';
import type { DashboardRuntime } from '../realtime/dashboard-runtime.js';
import type { PerformanceManagerBridge } from '../realtime/manager-bridge.js';
import type {
  FpsSample,
  PerformanceManagerOptions,
  PerformancePreference,
  PerformanceState,
  PerformanceTier,
  RealtimeHealth,
  TabVisibility,
} from '../types.js';
import { AdaptiveRenderer } from './adaptive-renderer.js';
import { AnimationScaler } from './animation-scaler.js';
import { resolveTier } from './tier-resolver.js';

const DEFAULT_STORAGE_KEY = 'app-performance-preference';

export class PerformanceManager implements PerformanceManagerBridge {
  private readonly storageKey: string;
  private readonly fpsProbeDurationMs: number;
  private readonly fpsReprobeHiddenMs: number;
  private readonly enableHealthMonitor: boolean;
  private readonly renderer: AdaptiveRenderer;
  private readonly animationScaler = new AnimationScaler();
  private readonly onChange?: (state: PerformanceState) => void;
  private readonly listeners = new Set<(state: PerformanceState) => void>();

  private preference: PerformancePreference = 'auto';
  private state: PerformanceState | null = null;
  private disposed = false;
  private hiddenAt = 0;
  private motionMq: MediaQueryList | null = null;
  private dashboard: DashboardRuntime | null = null;
  private visibility: TabVisibility = 'visible';
  private healthSnapshot: RealtimeHealth | null = null;
  private tierCap: (() => PerformanceTier | null) | null = null;
  private readonly featurePipeline: ((
    features: import('../types.js').AdaptiveFeatures,
    tier: PerformanceTier,
  ) => import('../types.js').AdaptiveFeatures)[] = [];

  constructor(options: PerformanceManagerOptions = {}) {
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.fpsProbeDurationMs = options.fpsProbeDurationMs ?? 1500;
    this.fpsReprobeHiddenMs = options.fpsReprobeHiddenMs ?? 60_000;
    this.enableHealthMonitor = options.enableHealthMonitor ?? true;
    this.onChange = options.onChange;
    this.renderer = new AdaptiveRenderer(
      options.root ?? document.documentElement,
    );

    this.preference = this.loadPreference();
  }

  async init(): Promise<PerformanceState> {
    const lowPower = await isLowPowerDevice();
    const signals = collectDeviceSignals(lowPower);
    const fps = await probeFps(this.fpsProbeDurationMs);

    this.bindListeners();
    return this.recompute(signals, fps);
  }

  attachDashboard(runtime: DashboardRuntime): void {
    this.dashboard = runtime;
    runtime.start(this.enableHealthMonitor);
  }

  getDashboard(): DashboardRuntime | null {
    return this.dashboard;
  }

  getState(): PerformanceState | null {
    return this.state;
  }

  getPreference(): PerformancePreference {
    return this.preference;
  }

  getTier(): PerformanceTier | null {
    return this.state?.tier ?? null;
  }

  getEffectiveTier(): PerformanceTier {
    return this.state?.effectiveTier ?? 'full';
  }

  getAnimationScaler(): AnimationScaler {
    return this.animationScaler;
  }

  /** Battery / thermal / custom modifiers applied after tier resolution. */
  registerTierCap(fn: () => PerformanceTier | null): () => void {
    this.tierCap = fn;
    return () => {
      if (this.tierCap === fn) this.tierCap = null;
    };
  }

  registerFeaturePipeline(
    fn: (
      features: import('../types.js').AdaptiveFeatures,
      tier: PerformanceTier,
    ) => import('../types.js').AdaptiveFeatures,
  ): () => void {
    this.featurePipeline.push(fn);
    return () => {
      const i = this.featurePipeline.indexOf(fn);
      if (i >= 0) this.featurePipeline.splice(i, 1);
    };
  }

  subscribe(listener: (state: PerformanceState) => void): void {
    this.listeners.add(listener);
    if (this.state) listener(this.state);
  }

  unsubscribe(listener: (state: PerformanceState) => void): void {
    this.listeners.delete(listener);
  }

  setPreference(preference: PerformancePreference): void {
    this.preference = preference;
    try {
      localStorage.setItem(this.storageKey, preference);
    } catch {
      /* private mode */
    }
    void this.refresh();
  }

  async refresh(): Promise<PerformanceState> {
    const lowPower = await isLowPowerDevice();
    const signals = collectDeviceSignals(lowPower);
    const fps = await probeFps(this.fpsProbeDurationMs);
    return this.recompute(signals, fps);
  }

  /** Called when visibility or health downgrade changes effective tier. */
  async applyEffectiveTier(): Promise<PerformanceState | null> {
    if (!this.state) return null;
    const vis =
      this.dashboard?.visibility.getVisibility() ?? this.visibility;
    this.visibility = vis;
    return this.recompute(this.state.signals, this.state.fps);
  }

  patchHealth(health: RealtimeHealth): void {
    this.healthSnapshot = health;
    if (!this.state) return;
    const next = { ...this.state, health };
    this.state = next;
    this.emit(next);
  }

  shouldUseAdvancedCharts(): boolean {
    return this.state?.features.advancedCharts ?? false;
  }

  shouldEnableEffect(
    key: keyof Pick<
      import('../types.js').AdaptiveFeatures,
      | 'particles'
      | 'blurEffects'
      | 'glowEffects'
      | 'backgroundEffects'
      | 'heavyAnimations'
    >,
  ): boolean {
    return Boolean(this.state?.features[key]);
  }

  dispose(): void {
    this.disposed = true;
    this.motionMq?.removeEventListener('change', this.onMotionChange);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.dashboard?.dispose();
    this.dashboard = null;
    this.renderer.dispose();
    this.animationScaler.stop();
  }

  private async recompute(
    signals?: import('../types.js').DeviceSignals,
    fps?: FpsSample | null,
  ): Promise<PerformanceState> {
    const s = signals ?? collectDeviceSignals(this.state?.signals.isLowPower);
    const f = fps === undefined ? this.state?.fps ?? null : fps;

    const { tier, reasons } = resolveTier({
      preference: this.preference,
      signals: s,
      fps: f,
    });

    let effectiveTier =
      this.dashboard?.getEffectiveTier(tier) ??
      (this.healthSnapshot?.temporarilyDowngraded ? 'lite' : tier);
    const cap = this.tierCap?.();
    if (cap === 'lite' && effectiveTier === 'full') effectiveTier = 'lite';

    const safariLegacy = s.isOldSafari || s.isIPad4;
    const visibility =
      this.dashboard?.visibility.getVisibility() ?? this.visibility;

    let features = featuresForTier(effectiveTier, visibility, safariLegacy);
    for (const pipe of this.featurePipeline) {
      features = pipe(features, effectiveTier);
    }

    const allReasons = [...reasons];
    if (effectiveTier === 'lite' && tier === 'full') {
      allReasons.push('health-downgrade');
    }

    const state: PerformanceState = {
      preference: this.preference,
      tier,
      effectiveTier,
      features,
      signals: s,
      reasons: allReasons,
      fps: f,
      health: this.healthSnapshot,
      visibility,
      detectedAt: Date.now(),
    };

    this.state = state;
    this.renderer.apply(state);
    this.animationScaler.setFeatures(features);
    this.dashboard?.syncFromManager();
    if (this.dashboard) {
      this.healthSnapshot = this.dashboard.health.getHealth();
      state.health = this.healthSnapshot;
    }
    this.emit(state);

    return state;
  }

  private emit(state: PerformanceState): void {
    this.onChange?.(state);
    this.listeners.forEach((fn) => fn(state));
  }

  private loadPreference(): PerformancePreference {
    try {
      const v = localStorage.getItem(this.storageKey);
      if (v === 'auto' || v === 'lite' || v === 'full') return v;
    } catch {
      /* ignore */
    }
    return 'auto';
  }

  private bindListeners(): void {
    if (typeof window === 'undefined') return;

    this.motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.motionMq.addEventListener('change', this.onMotionChange);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onMotionChange = (): void => {
    if (this.disposed) return;
    const lowPower = this.state?.signals.isLowPower ?? false;
    const signals = collectDeviceSignals(lowPower);
    signals.isReducedMotion = prefersReducedMotion();
    void this.recompute(signals, this.state?.fps ?? null);
  };

  private onVisibility = (): void => {
    if (this.disposed) return;

    if (document.hidden) {
      this.hiddenAt = Date.now();
      this.visibility = 'hidden';
      void this.applyEffectiveTier();
      return;
    }

    this.visibility = 'visible';
    void this.applyEffectiveTier();

    const idle = Date.now() - this.hiddenAt;
    if (idle >= this.fpsReprobeHiddenMs) {
      void probeFps(this.fpsProbeDurationMs).then((fps) => {
        if (!this.disposed) void this.recompute(undefined, fps);
      });
    }
  };

}

let singleton: PerformanceManager | null = null;

export function getPerformanceManager(
  options?: PerformanceManagerOptions,
): PerformanceManager {
  if (!singleton) {
    singleton = new PerformanceManager(options);
  }
  return singleton;
}

export async function initPerformance(
  options?: PerformanceManagerOptions,
): Promise<PerformanceState> {
  const mgr = getPerformanceManager(options);
  const state = await mgr.init();
  const { getDashboardRuntime } = await import('../realtime/dashboard-runtime.js');
  getDashboardRuntime(mgr);
  return state;
}
