import { getPerformanceManager, initPerformance } from '../core/performance-manager.js';
import type { PerformanceManager } from '../core/performance-manager.js';
import { MetricsCacheLayer } from '../dashboard/metrics-cache.js';
import { OfflineStateManager } from '../dashboard/offline-state.js';
import { DebugOverlay } from '../debug/debug-overlay.js';
import { getDashboardRuntime } from '../realtime/dashboard-runtime.js';
import type { DashboardRuntime } from '../realtime/dashboard-runtime.js';
import { BatteryAdaptiveMode } from '../power/battery-adaptive.js';
import { ThermalGuard } from '../power/thermal-guard.js';
import { chartEngineForTier } from '../rendering/chart-engine.js';
import { applyGpuSafeToRoot } from '../rendering/gpu-safe.js';
import { applyThemeToRoot, themeForTier } from '../rendering/theme-engine.js';
import { MemoryWatchdog } from '../safeguards/memory-watchdog.js';
import { SafariCrashGuard } from '../safeguards/safari-crash-guard.js';
import { isBrowser } from '../ssr/guards.js';
import { TransportManager } from '../transport/transport-manager.js';
import type {
  PlatformSnapshot,
  RealtimeDashboardPlatformOptions,
} from './types.js';
let platformSingleton: RealtimeDashboardPlatform<Record<string, unknown>> | null = null;

/**
 * Enterprise realtime dashboard platform — single integration entry point.
 */
export class RealtimeDashboardPlatform<T extends Record<string, unknown>> {
  readonly manager: PerformanceManager;
  readonly runtime: DashboardRuntime<T>;
  readonly cache: MetricsCacheLayer<T>;
  readonly offline: OfflineStateManager;
  readonly battery: BatteryAdaptiveMode;
  readonly thermal: ThermalGuard;
  readonly memoryWatchdog: MemoryWatchdog;
  readonly safariGuard: SafariCrashGuard;
  readonly transport: TransportManager<T>;

  private debug: DebugOverlay | null = null;
  private latestMetrics: T | null = null;
  private disposed = false;

  constructor(
    manager: PerformanceManager,
    private readonly options: RealtimeDashboardPlatformOptions<T>,
  ) {
    this.manager = manager;
    this.runtime = getDashboardRuntime(manager) as DashboardRuntime<T>;
    this.cache = new MetricsCacheLayer<T>({
      storageKey: options.storageKey ?? 'dashboard-metrics-cache',
      ttlMs: options.cacheTtlMs,
    });
    this.offline = new OfflineStateManager();
    this.battery = new BatteryAdaptiveMode({
      onModeChange: () => void manager.applyEffectiveTier(),
    });
    this.thermal = new ThermalGuard({
      onThermal: () => void manager.applyEffectiveTier(),
    });
    this.memoryWatchdog = new MemoryWatchdog({
      onPressure: () => void manager.applyEffectiveTier(),
      onRecover: () => void manager.applyEffectiveTier(),
    });
    this.safariGuard = new SafariCrashGuard();

    this.transport = new TransportManager<T>({
      endpoints: options.endpoints,
      scheduler: this.runtime.scheduler,
      parse: options.parseMessage,
      pollHeaders: options.pollHeaders,
      getConfig: () => this.runtime.getRealtimeConfig(),
      onStatus: (status) => this.offline.setConnectionStatus(status),
      onLatency: (ms) => this.runtime.health.recordWebSocketLatency(ms),
    });

    this.runtime.health.subscribe((h) => this.thermal.ingestHealth(h));
    manager.subscribe(() => this.syncPresentation());

    manager.registerTierCap(() =>
      this.battery.shouldForceLiteTier() || this.thermal.isActive() ? 'lite' : null,
    );

    manager.registerFeaturePipeline((features, tier) => {
      let f = features;
      if (this.battery.getMode() === 'battery') {
        f = this.battery.applyToFeatures(f, tier);
      }
      if (this.thermal.isActive()) {
        f = this.thermal.applyToFeatures(f);
      }
      return f;
    });

    this.runtime.scheduler.onNetworkFlush((batch) => {
      const last = batch[batch.length - 1] as T | undefined;
      if (last) {
        this.latestMetrics = last;
        this.cache.save(last);
      }
    });
  }

  static async create<T extends Record<string, unknown>>(
    options: RealtimeDashboardPlatformOptions<T>,
  ): Promise<RealtimeDashboardPlatform<T>> {
    const manager = getPerformanceManager();
    await initPerformance();
    if (!platformSingleton) {
      platformSingleton = new RealtimeDashboardPlatform(
        manager,
        options,
      ) as RealtimeDashboardPlatform<Record<string, unknown>>;
    }
    return platformSingleton as RealtimeDashboardPlatform<T>;
  }

  async init(): Promise<PlatformSnapshot<T>> {
    const cached = this.cache.load();
    if (cached) this.latestMetrics = cached.data;

    await this.battery.init();
    this.thermal.start();
    this.memoryWatchdog.start();
    this.safariGuard.start(() => void this.manager.refresh());
    this.runtime.start();

    if (this.options.devMode && isBrowser()) {
      this.debug = new DebugOverlay({
        enabled: true,
        getSnapshot: () => this.getSnapshot(),
      });
      this.debug.mount();
    }

    this.syncPresentation();
    return this.getSnapshot();
  }

  connect(): void {
    this.transport.connect();
  }

  disconnect(): void {
    this.transport.disconnect();
  }

  getSnapshot(): PlatformSnapshot<T> {
    const state = this.manager.getState();
    const health = state?.health ?? this.runtime.health.getHealth();
    const cachedAt = this.cache.load()?.cachedAt ?? null;

    const snapshot: PlatformSnapshot<T> = {
      metrics: this.latestMetrics,
      cachedAt,
      isStale: this.offline.shouldShowStaleIndicator(
        cachedAt != null && Date.now() - cachedAt > (this.options.cacheTtlMs ?? 300_000),
      ),
      connectionStatus: this.offline.isOffline()
        ? 'offline'
        : this.transport.getStatus(),
      activeTransport: this.transport.getActiveTransport(),
      effectiveTier: state?.effectiveTier ?? 'full',
      powerMode: this.resolvePowerMode(),
      visibility: state?.visibility ?? 'visible',
      health,
    };

    return this.cache.hydrateSnapshot(snapshot);
  }

  getChartEngine() {
    const state = this.manager.getState();
    const tier = state?.effectiveTier ?? 'full';
    const rt = state?.features.realtime;
    return chartEngineForTier(
      tier,
      rt?.maxChartHistoryPoints ?? 120,
      rt?.chartUpdateIntervalMs ?? 0,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.debug?.dispose();
    this.transport.dispose();
    this.offline.dispose();
    this.battery.dispose();
    this.thermal.dispose();
    this.memoryWatchdog.dispose();
    this.safariGuard.dispose();
    this.runtime.dispose();
    this.manager.dispose();
    platformSingleton = null;
  }

  private resolvePowerMode(): import('./types.js').PowerMode {
    if (this.thermal.isActive()) return 'thermal';
    if (this.battery.getMode() === 'battery') return 'battery';
    return 'normal';
  }

  private syncPresentation(): void {
    if (!isBrowser()) return;
    const state = this.manager.getState();
    if (!state) return;
    const root = document.documentElement;
    applyGpuSafeToRoot(root, state.features);
    applyThemeToRoot(root, themeForTier(state.effectiveTier));
    this.transport.setConfig();
  }
}

export function getRealtimeDashboardPlatform<T extends Record<string, unknown>>():
  RealtimeDashboardPlatform<T> | null {
  return platformSingleton as RealtimeDashboardPlatform<T> | null;
}
