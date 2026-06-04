import type { AdaptiveFeatures, PerformanceTier, TabVisibility } from '../types.js';
import { realtimeConfigFor } from './realtime-config.js';

export function featuresForTier(
  tier: PerformanceTier,
  visibility: TabVisibility = 'visible',
  safariLegacy = false,
): AdaptiveFeatures {
  const realtime = realtimeConfigFor(tier, visibility, safariLegacy);

  if (tier === 'lite') {
    return {
      heavyAnimations: realtime.animationsEnabled,
      blurEffects: false,
      particles: false,
      backgroundEffects: false,
      glowEffects: false,
      animatedGradients: false,
      advancedCharts: false,
      richTransitions: false,
      animationFps: realtime.uiAnimationFps || 30,
      animationSpeed: 0.5,
      realtimeIntervalMultiplier: 2.5,
      minimizeDomUpdates: true,
      realtime,
    };
  }

  return {
    heavyAnimations: realtime.animationsEnabled,
    blurEffects: true,
    particles: true,
    backgroundEffects: true,
    glowEffects: true,
    animatedGradients: true,
    advancedCharts: true,
    richTransitions: true,
    animationFps: realtime.uiAnimationFps || 60,
    animationSpeed: 1,
    realtimeIntervalMultiplier: 1,
    minimizeDomUpdates: false,
    realtime,
  };
}
