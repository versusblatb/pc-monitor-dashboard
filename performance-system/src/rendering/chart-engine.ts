import type { ChartEngineConfig } from '../platform/types.js';
import type { PerformanceTier } from '../types.js';

export function chartEngineForTier(
  tier: PerformanceTier,
  maxPoints: number,
  chartIntervalMs: number,
): ChartEngineConfig {
  if (tier === 'lite') {
    return {
      renderer: 'svg',
      animated: false,
      interpolation: false,
      gradientRichness: 'none',
      maxPoints: Math.min(maxPoints, 60),
      redrawIntervalMs: Math.max(chartIntervalMs, 2000),
    };
  }

  return {
    renderer: 'svg',
    animated: true,
    interpolation: true,
    gradientRichness: 'rich',
    maxPoints,
    redrawIntervalMs: chartIntervalMs,
  };
}

export function rechartsPropsFromEngine(engine: ChartEngineConfig): Record<string, unknown> {
  return {
    isAnimationActive: engine.animated,
    animationDuration: engine.animated ? 400 : 0,
    dot: false,
    activeDot: engine.animated ? { r: 4 } : false,
  };
}
