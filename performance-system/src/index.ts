/* Core */
export type {
  AdaptiveFeatures,
  DetectionReason,
  DeviceSignals,
  FpsSample,
  PerformanceManagerOptions,
  PerformancePreference,
  PerformanceState,
  PerformanceTier,
  RealtimeConfig,
  RealtimeHealth,
  TabVisibility,
} from './types.js';

export {
  collectDeviceSignals,
  prefersReducedMotion,
  readDeviceMemory,
  readHardwareConcurrency,
  scoreDeviceWeakness,
  AUTO_LITE_THRESHOLD,
} from './detection/device-capabilities.js';

export {
  getUserAgent,
  hasWeakGpuHint,
  isIPad4,
  isLegacyDevice,
  isOldSafari,
  isSafari,
} from './detection/user-agent.js';

export { isLowFps, probeFps } from './detection/fps-probe.js';

export { featuresForTier } from './modes/features.js';
export { realtimeConfigFor } from './modes/realtime-config.js';

export { AdaptiveRenderer } from './core/adaptive-renderer.js';
export {
  AnimationScaler,
  scaledRealtimeInterval,
  scheduleDomUpdate,
} from './core/animation-scaler.js';
export { resolveTier } from './core/tier-resolver.js';
export {
  getPerformanceManager,
  initPerformance,
  PerformanceManager,
} from './core/performance-manager.js';

/* Platform */
export type {
  ChartEngineConfig,
  ConnectionStatus,
  PlatformSnapshot,
  PowerMode,
  RealtimeDashboardPlatformOptions,
  ThemeTokens,
  TransportEndpoints,
  TransportKind,
} from './platform/types.js';

export {
  RealtimeDashboardPlatform,
  getRealtimeDashboardPlatform,
} from './platform/realtime-dashboard-platform.js';

/* Transport */
export { TransportManager } from './transport/transport-manager.js';
export { WebSocketTransport } from './transport/websocket-transport.js';
export { SseTransport } from './transport/sse-transport.js';
export { PollingTransport } from './transport/polling-transport.js';
export { ReconnectBackoff } from './transport/reconnect-backoff.js';

/* Realtime */
export { CleanupRegistry } from './realtime/cleanup-registry.js';
export { VisibilityController } from './realtime/visibility-controller.js';
export { SmartUpdateScheduler } from './realtime/update-scheduler.js';
export { RealtimeHealthMonitor } from './realtime/health-monitor.js';
export { AdaptiveWebSocket } from './realtime/adaptive-websocket.js';
export {
  DashboardRuntime,
  getDashboardRuntime,
} from './realtime/dashboard-runtime.js';

/* Power */
export { BatteryAdaptiveMode } from './power/battery-adaptive.js';
export { ThermalGuard } from './power/thermal-guard.js';

/* Rendering */
export { chartEngineForTier, rechartsPropsFromEngine } from './rendering/chart-engine.js';
export { themeForTier, applyThemeToRoot } from './rendering/theme-engine.js';
export { applyGpuSafeToRoot, gpuSafeVars, GPU_FORBIDDEN } from './rendering/gpu-safe.js';

/* Dashboard */
export { MetricsCacheLayer } from './dashboard/metrics-cache.js';
export { OfflineStateManager } from './dashboard/offline-state.js';
export {
  ViewportVirtualizer,
  observeLazyMount,
} from './dashboard/virtualization.js';

/* Safeguards */
export { MemoryWatchdog } from './safeguards/memory-watchdog.js';
export { SafariCrashGuard } from './safeguards/safari-crash-guard.js';

/* Recharts */
export {
  limitChartHistory,
  memoizeChartDataset,
  virtualizedChartSlice,
  shouldRedrawChart,
  downsampleSeries,
  mergeMetricBatch,
} from './recharts/optimize.js';
export type { ChartSeriesPoint } from './recharts/optimize.js';

/* SSR / Next */
export { isBrowser, isServer, safeWindow, safeMatchMedia } from './ssr/guards.js';
export {
  dynamicChartImport,
  scheduleLazyHydration,
  clientOnlyProps,
} from './ssr/next.js';

/* Safari DOM */
export {
  installPassiveScrollListeners,
  applyCompositorStyle,
  batchedDomUpdate,
} from './safari/dom-safari.js';

/* Debug */
export { DebugOverlay } from './debug/debug-overlay.js';

/* UI */
export { PerformanceSettingsPanel } from './ui/settings-panel.js';
export type { SettingsPanelOptions } from './ui/settings-panel.js';
