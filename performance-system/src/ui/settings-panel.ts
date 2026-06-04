import type { PerformanceManager } from '../core/performance-manager.js';
import type { PerformancePreference, PerformanceState } from '../types.js';

export interface SettingsPanelOptions {
  manager: PerformanceManager;
  container?: HTMLElement;
  title?: string;
  labels?: Partial<typeof DEFAULT_LABELS>;
}

const DEFAULT_LABELS = {
  auto: 'Auto',
  lite: 'Lite',
  full: 'Full',
} as const;

export class PerformanceSettingsPanel {
  private readonly manager: PerformanceManager;
  private readonly root: HTMLElement;
  private readonly labels: typeof DEFAULT_LABELS;
  private readonly title: string;
  private onStateChange?: (state: PerformanceState) => void;

  constructor(options: SettingsPanelOptions) {
    this.manager = options.manager;
    this.labels = { ...DEFAULT_LABELS, ...options.labels };
    this.title = options.title ?? 'Performance';

    if (options.container) {
      this.root = options.container;
      this.root.classList.add('perf-settings-panel');
    } else {
      this.root = document.createElement('aside');
      this.root.className = 'perf-settings-panel perf-settings-panel--floating';
      document.body.appendChild(this.root);
    }

    this.render();
    this.bindButtons();

    const state = this.manager.getState();
    if (state) this.sync(state);

    this.onStateChange = (s) => this.sync(s);
    this.manager.subscribe(this.onStateChange);
  }

  private render(): void {
    this.root.innerHTML = `
      <header class="perf-settings-panel__header">
        <h2 class="perf-settings-panel__title"></h2>
        <p class="perf-settings-panel__tier" data-perf-tier-label></p>
      </header>
      <div class="perf-settings-panel__modes" role="radiogroup" aria-label="Performance mode">
        ${this.modeButton('auto', this.labels.auto)}
        ${this.modeButton('lite', this.labels.lite)}
        ${this.modeButton('full', this.labels.full)}
      </div>
      <details class="perf-settings-panel__details">
        <summary>Detection info</summary>
        <ul class="perf-settings-panel__reasons" data-perf-reasons></ul>
        <p class="perf-settings-panel__meta" data-perf-meta></p>
      </details>
    `;

    const titleEl = this.root.querySelector('.perf-settings-panel__title');
    if (titleEl) titleEl.textContent = this.title;
  }

  private modeButton(pref: PerformancePreference, label: string): string {
    return `
      <button
        type="button"
        class="perf-settings-panel__mode"
        data-pref="${pref}"
        role="radio"
        aria-checked="false"
      >${this.escape(label)}</button>
    `;
  }

  private bindButtons(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-pref]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pref = btn.dataset.pref as PerformancePreference;
        this.manager.setPreference(pref);
      });
    });
  }

  private setActive(pref: PerformancePreference): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-pref]').forEach((btn) => {
      const active = btn.dataset.pref === pref;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-checked', String(active));
    });
  }

  sync(state: PerformanceState): void {
    this.setActive(state.preference);

    const tierLabel = this.root.querySelector('[data-perf-tier-label]');
    if (tierLabel) {
      const effective =
        state.effectiveTier === 'lite' ? 'Lite' : 'Full graphics';
      const downgraded =
        state.effectiveTier !== state.tier ? ' (FPS downgrade)' : '';
      tierLabel.textContent =
        state.preference === 'auto'
          ? `Auto → ${effective}${downgraded}`
          : state.preference === 'lite'
            ? 'Lite mode'
            : `Full graphics${downgraded}`;
    }

    const reasonsEl = this.root.querySelector('[data-perf-reasons]');
    if (reasonsEl) {
      reasonsEl.innerHTML = state.reasons
        .map((r) => `<li>${this.escape(r)}</li>`)
        .join('');
    }

    const meta = this.root.querySelector('[data-perf-meta]');
    if (meta) {
      const mem =
        state.signals.deviceMemory != null
          ? `${state.signals.deviceMemory} GB RAM`
          : 'RAM: n/a';
      const uiFps = state.health?.uiFps;
      const wsMs = state.health?.websocketLatencyMs;
      const fps = uiFps
        ? `UI ${uiFps} FPS`
        : state.fps
          ? `FPS ~${state.fps.average}`
          : 'FPS…';
      const ws = wsMs != null ? ` · WS ${Math.round(wsMs)}ms` : '';
      const vis = state.visibility === 'hidden' ? ' · tab hidden' : '';
      meta.textContent = `${mem} · ${state.signals.hardwareConcurrency} cores · ${fps}${ws}${vis}`;
    }
  }

  dispose(): void {
    if (this.onStateChange) {
      this.manager.unsubscribe(this.onStateChange);
    }
    if (this.root.classList.contains('perf-settings-panel--floating')) {
      this.root.remove();
    }
  }

  private escape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
