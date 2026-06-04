import type { PerformanceTier, RealtimeConfig, TabVisibility } from '../types.js';

const FULL_VISIBLE: RealtimeConfig = {
  websocketIntervalMs: 1000,
  chartUpdateIntervalMs: 0,
  uiAnimationFps: 60,
  maxChartHistoryPoints: 120,
  chartsPaused: false,
  animationsEnabled: true,
  websocketPaused: false,
};

const LITE_VISIBLE: RealtimeConfig = {
  websocketIntervalMs: 2500,
  chartUpdateIntervalMs: 2000,
  uiAnimationFps: 30,
  maxChartHistoryPoints: 60,
  chartsPaused: false,
  animationsEnabled: true,
  websocketPaused: false,
};

const HIDDEN_OVERLAY: Partial<RealtimeConfig> = {
  websocketIntervalMs: 8000,
  chartUpdateIntervalMs: 0,
  chartsPaused: true,
  animationsEnabled: false,
  websocketPaused: true,
  uiAnimationFps: 0,
};

/** Safari / iPad: tighter memory — fewer points, slower charts. */
const SAFARI_LITE_ADJUST: Partial<RealtimeConfig> = {
  maxChartHistoryPoints: 40,
  chartUpdateIntervalMs: 2500,
  websocketIntervalMs: 3000,
};

export function realtimeConfigFor(
  tier: PerformanceTier,
  visibility: TabVisibility,
  safariLegacy = false,
): RealtimeConfig {
  const base = tier === 'full' ? { ...FULL_VISIBLE } : { ...LITE_VISIBLE };

  if (safariLegacy && tier === 'lite') {
    Object.assign(base, SAFARI_LITE_ADJUST);
  } else if (safariLegacy && tier === 'full') {
    base.maxChartHistoryPoints = 80;
    base.chartUpdateIntervalMs = 500;
  }

  if (visibility === 'hidden') {
    return { ...base, ...HIDDEN_OVERLAY };
  }

  return base;
}
