import type { PerformanceTier, RealtimeConfig, TabVisibility } from '../types.js';
import { featuresForTier } from '../modes/features.js';
import type { PerformanceManagerBridge } from './manager-bridge.js';
import { AdaptiveWebSocket } from './adaptive-websocket.js';
import { CleanupRegistry } from './cleanup-registry.js';
import { RealtimeHealthMonitor } from './health-monitor.js';
import { SmartUpdateScheduler } from './update-scheduler.js';
import { VisibilityController } from './visibility-controller.js';
import { installPassiveScrollListeners } from '../safari/dom-safari.js';

export class DashboardRuntime<T = unknown> {
  readonly cleanup = new CleanupRegistry();
  readonly visibility = new VisibilityController();
  readonly scheduler = new SmartUpdateScheduler<T>();
  readonly health: RealtimeHealthMonitor;

  private websocket: AdaptiveWebSocket<T> | null = null;
  private tabVisibility: TabVisibility = 'visible';
  private temporaryDowngrade = false;

  constructor(private readonly manager: PerformanceManagerBridge) {
    this.health = new RealtimeHealthMonitor({
      onDowngrade: () => {
        this.temporaryDowngrade = true;
        void this.manager.applyEffectiveTier();
      },
      onRecover: () => {
        this.temporaryDowngrade = false;
        void this.manager.applyEffectiveTier();
      },
    });

    this.cleanup.register(
      this.visibility.subscribe((v) => {
        this.tabVisibility = v;
        void this.manager.applyEffectiveTier();
      }),
    );

    this.cleanup.register(
      this.health.subscribe((h) => {
        this.manager.patchHealth(h);
        this.temporaryDowngrade = h.temporarilyDowngraded;
      }),
    );

    this.cleanup.register(installPassiveScrollListeners());

    this.cleanup.registerInterval(() => {
      this.health.recordNetworkFps(this.scheduler.getNetworkFps());
    }, 1000);
  }

  start(enableHealth = true): void {
    this.scheduler.start();
    if (enableHealth) this.health.start();

    const config = this.getRealtimeConfig();
    this.scheduler.setConfig(config);
  }

  getEffectiveTier(base: PerformanceTier): PerformanceTier {
    if (this.temporaryDowngrade || this.health.isTemporarilyDowngraded()) {
      return 'lite';
    }
    return base;
  }

  getRealtimeConfig(): RealtimeConfig {
    const state = this.manager.getState();
    const base = state?.tier ?? 'full';
    const effective = this.getEffectiveTier(base);
    const safari =
      state?.signals.isOldSafari || state?.signals.isIPad4 || false;
    return featuresForTier(effective, this.tabVisibility, safari).realtime;
  }

  syncFromManager(): void {
    const config = this.getRealtimeConfig();
    this.scheduler.setConfig(config);
    this.websocket?.setConfig(config);

    const features = this.manager.getState()?.features;
    if (features) {
      this.manager.getAnimationScaler().setFeatures(features);
    }
  }

  connectWebSocket(options: Omit<import('./adaptive-websocket.js').AdaptiveWebSocketOptions<T>, 'scheduler'>): AdaptiveWebSocket<T> {
    this.websocket?.dispose();
    const ws = new AdaptiveWebSocket<T>(
      { ...options, scheduler: this.scheduler, recordLatency: (ms) => this.health.recordWebSocketLatency(ms) },
      this.getRealtimeConfig(),
    );
    this.websocket = ws;
    ws.connect();
    this.cleanup.register(() => ws.dispose());
    return ws;
  }

  measureRender<T>(fn: () => T): T {
    const t0 = performance.now();
    const result = fn();
    this.health.recordRenderTime(performance.now() - t0);
    return result;
  }

  dispose(): void {
    this.websocket?.dispose();
    this.scheduler.dispose();
    this.health.dispose();
    this.visibility.dispose();
    this.cleanup.dispose();
  }
}

let dashboardRuntime: DashboardRuntime | null = null;

export function getDashboardRuntime(manager: PerformanceManagerBridge): DashboardRuntime {
  if (!dashboardRuntime) {
    dashboardRuntime = new DashboardRuntime(manager);
    manager.attachDashboard(dashboardRuntime);
  }
  return dashboardRuntime;
}
