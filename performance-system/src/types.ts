/** User-selected override; `auto` follows device + runtime signals. */
export type PerformancePreference = 'auto' | 'lite' | 'full';

/** Resolved rendering tier applied to the document. */
export type PerformanceTier = 'lite' | 'full';

export type TabVisibility = 'visible' | 'hidden';

export type DetectionReason =
  | 'reduced-motion'
  | 'low-memory'
  | 'low-cpu'
  | 'low-power'
  | 'save-data'
  | 'old-safari'
  | 'ipad-4'
  | 'legacy-device'
  | 'weak-gpu-hint'
  | 'low-fps'
  | 'health-downgrade'
  | 'manual-lite'
  | 'manual-full'
  | 'default-full';

export interface DeviceSignals {
  hardwareConcurrency: number;
  deviceMemory: number | null;
  isReducedMotion: boolean;
  isOldSafari: boolean;
  isIPad4: boolean;
  isLegacyDevice: boolean;
  isLowPower: boolean;
  isSaveData: boolean;
  weakGpuHint: boolean;
  userAgent: string;
}

export interface FpsSample {
  average: number;
  min: number;
  samples: number;
  durationMs: number;
}

/** Dashboard realtime intervals (tier + visibility applied externally). */
export interface RealtimeConfig {
  /** Min interval between WebSocket-driven state commits to the store. */
  websocketIntervalMs: number;
  /** Chart React commit interval; `0` = every UI flush (full realtime). */
  chartUpdateIntervalMs: number;
  /** UI animation / rAF cap. */
  uiAnimationFps: number;
  /** Max points per series (Recharts / canvas). */
  maxChartHistoryPoints: number;
  /** Charts frozen while tab hidden. */
  chartsPaused: boolean;
  /** Heavy CSS/canvas animations allowed. */
  animationsEnabled: boolean;
  /** WebSocket messages ignored while hidden (except reconnect). */
  websocketPaused: boolean;
}

export interface RealtimeHealth {
  uiFps: number;
  uiFpsMin: number;
  networkFps: number;
  websocketLatencyMs: number | null;
  memoryPressure: 'low' | 'medium' | 'high' | 'unknown';
  lastRenderTimeMs: number;
  temporarilyDowngraded: boolean;
  downgradedUntil: number | null;
  updatedAt: number;
}

export interface AdaptiveFeatures {
  heavyAnimations: boolean;
  blurEffects: boolean;
  particles: boolean;
  backgroundEffects: boolean;
  glowEffects: boolean;
  animatedGradients: boolean;
  advancedCharts: boolean;
  richTransitions: boolean;
  animationFps: number;
  animationSpeed: number;
  realtimeIntervalMultiplier: number;
  minimizeDomUpdates: boolean;
  realtime: RealtimeConfig;
}

export interface PerformanceState {
  preference: PerformancePreference;
  tier: PerformanceTier;
  /** Tier after health monitor temporary downgrade. */
  effectiveTier: PerformanceTier;
  features: AdaptiveFeatures;
  signals: DeviceSignals;
  reasons: DetectionReason[];
  fps: FpsSample | null;
  health: RealtimeHealth | null;
  visibility: TabVisibility;
  detectedAt: number;
}

export interface PerformanceManagerOptions {
  storageKey?: string;
  fpsProbeDurationMs?: number;
  fpsReprobeHiddenMs?: number;
  root?: HTMLElement;
  onChange?: (state: PerformanceState) => void;
  /** Enable continuous health monitor + auto downgrade (default true). */
  enableHealthMonitor?: boolean;
  /** Seconds to hold temporary lite downgrade after low FPS (default 45). */
  healthDowngradeDurationSec?: number;
  /** UI FPS threshold for temporary downgrade (default 28). */
  healthDowngradeFpsThreshold?: number;
}
