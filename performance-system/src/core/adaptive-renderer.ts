import type { AdaptiveFeatures, PerformanceState, PerformanceTier } from '../types.js';

const ROOT_CLASS_LITE = 'perf-tier-lite';
const ROOT_CLASS_FULL = 'perf-tier-full';
const ROOT_CLASS_REDUCED = 'perf-reduced-motion';
const ROOT_CLASS_SAFARI_LEGACY = 'perf-safari-legacy';

export class AdaptiveRenderer {
  constructor(private readonly root: HTMLElement = document.documentElement) {}

  apply(state: PerformanceState): void {
    const { tier, effectiveTier, features, signals } = state;
    const renderTier = effectiveTier;

    this.root.dataset.performanceTier = tier;
    this.root.dataset.performanceEffectiveTier = effectiveTier;
    this.root.dataset.performanceMode = state.preference;
    this.root.dataset.perfChartsPaused = String(features.realtime.chartsPaused);

    this.root.classList.remove(ROOT_CLASS_LITE, ROOT_CLASS_FULL);
    this.root.classList.add(
      renderTier === 'lite' ? ROOT_CLASS_LITE : ROOT_CLASS_FULL,
    );

    this.root.classList.toggle(ROOT_CLASS_REDUCED, signals.isReducedMotion);
    this.root.classList.toggle(
      'perf-tab-hidden',
      state.visibility === 'hidden',
    );
    this.root.classList.toggle(
      ROOT_CLASS_SAFARI_LEGACY,
      signals.isOldSafari || signals.isIPad4,
    );

    this.applyCssVariables(features, renderTier);
    this.applyFeatureFlags(features);
  }

  private applyCssVariables(features: AdaptiveFeatures, tier: PerformanceTier): void {
    const style = this.root.style;

    style.setProperty('--perf-animation-fps', String(features.animationFps));
    style.setProperty('--perf-animation-speed', String(features.animationSpeed));
    style.setProperty(
      '--perf-realtime-multiplier',
      String(features.realtimeIntervalMultiplier),
    );
    style.setProperty(
      '--perf-transition-duration',
      tier === 'lite' ? '0.12s' : '0.35s',
    );
    style.setProperty('--perf-blur', features.blurEffects ? '12px' : '0px');
    style.setProperty('--perf-enable-blur', features.blurEffects ? '1' : '0');
    style.setProperty('--perf-enable-glow', features.glowEffects ? '1' : '0');
    style.setProperty(
      '--perf-chart-complexity',
      features.advancedCharts ? 'advanced' : 'simple',
    );
  }

  /** Data attributes for app-level conditional logic. */
  private applyFeatureFlags(features: AdaptiveFeatures): void {
    const map: Record<string, boolean> = {
      'data-perf-heavy-animations': features.heavyAnimations,
      'data-perf-blur': features.blurEffects,
      'data-perf-particles': features.particles,
      'data-perf-background-fx': features.backgroundEffects,
      'data-perf-glow': features.glowEffects,
      'data-perf-animated-gradients': features.animatedGradients,
      'data-perf-advanced-charts': features.advancedCharts,
      'data-perf-rich-transitions': features.richTransitions,
      'data-perf-minimize-dom': features.minimizeDomUpdates,
    };

    for (const [attr, enabled] of Object.entries(map)) {
      this.root.setAttribute(attr, enabled ? 'true' : 'false');
    }
  }

  dispose(): void {
    this.root.classList.remove(ROOT_CLASS_LITE, ROOT_CLASS_FULL, ROOT_CLASS_REDUCED);
    delete this.root.dataset.performanceTier;
    delete this.root.dataset.performanceMode;

    const attrs = [
      'data-perf-heavy-animations',
      'data-perf-blur',
      'data-perf-particles',
      'data-perf-background-fx',
      'data-perf-glow',
      'data-perf-animated-gradients',
      'data-perf-advanced-charts',
      'data-perf-rich-transitions',
      'data-perf-minimize-dom',
    ];
    attrs.forEach((a) => this.root.removeAttribute(a));
  }
}
