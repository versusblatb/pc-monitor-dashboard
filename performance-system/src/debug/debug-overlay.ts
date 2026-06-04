import type { PlatformSnapshot } from '../platform/types.js';
import { isBrowser } from '../ssr/guards.js';
import { CleanupRegistry } from '../realtime/cleanup-registry.js';

export interface DebugOverlayOptions {
  enabled?: boolean;
  getSnapshot: () => PlatformSnapshot<unknown>;
}

/**
 * Dev-only performance HUD: FPS, WS latency, memory, tier, render cost.
 */
export class DebugOverlay {
  private el: HTMLElement | null = null;
  private readonly cleanup = new CleanupRegistry();
  private readonly enabled: boolean;

  constructor(private readonly options: DebugOverlayOptions) {
    this.enabled =
      Boolean(options.enabled) &&
      isBrowser() &&
      (localStorage.getItem('perf-debug') === '1' ||
        new URLSearchParams(location.search).has('perf-debug'));
  }

  mount(): void {
    if (!this.enabled) return;

    this.el = document.createElement('div');
    this.el.className = 'perf-debug-overlay';
    this.el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.el);

    this.cleanup.register(() => this.el?.remove());

    this.cleanup.registerInterval(() => this.render(), 500);
  }

  dispose(): void {
    this.cleanup.dispose();
    this.el = null;
  }

  private render(): void {
    if (!this.el) return;
    const s = this.options.getSnapshot();
    const h = s.health;

    this.el.innerHTML = `
      <div class="perf-debug-overlay__title">Performance Debug</div>
      <div>UI FPS: ${h?.uiFps ?? '—'} (min ${h?.uiFpsMin ?? '—'})</div>
      <div>Network FPS: ${h?.networkFps ?? '—'}</div>
      <div>WS latency: ${h?.websocketLatencyMs != null ? `${Math.round(h.websocketLatencyMs)}ms` : '—'}</div>
      <div>Memory: ${h?.memoryPressure ?? '—'}</div>
      <div>Render: ${h?.lastRenderTimeMs != null ? `${h.lastRenderTimeMs.toFixed(1)}ms` : '—'}</div>
      <div>Tier: ${s.effectiveTier} ${s.powerMode !== 'normal' ? `(${s.powerMode})` : ''}</div>
      <div>Transport: ${s.activeTransport ?? '—'} · ${s.connectionStatus}</div>
      <div>Tab: ${s.visibility}${s.isStale ? ' · stale' : ''}</div>
    `;
  }
}
