import type { PerformanceTier, RealtimeHealth } from '../types.js';

/** Breaks circular import between PerformanceManager and DashboardRuntime. */
export interface PerformanceManagerBridge {
  getState(): {
    tier: PerformanceTier;
    signals: { isOldSafari: boolean; isIPad4: boolean };
    features: import('../types.js').AdaptiveFeatures;
  } | null;
  applyEffectiveTier(): Promise<unknown>;
  patchHealth(health: RealtimeHealth): void;
  getAnimationScaler(): import('../core/animation-scaler.js').AnimationScaler;
  attachDashboard(runtime: import('./dashboard-runtime.js').DashboardRuntime): void;
}
