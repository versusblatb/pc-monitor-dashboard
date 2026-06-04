import { isIPad4, isOldSafari } from '../detection/user-agent.js';
import { CleanupRegistry } from '../realtime/cleanup-registry.js';

/**
 * Safari crash prevention: cap listeners, avoid heap spikes, recover on page show.
 */
export class SafariCrashGuard {
  private readonly cleanup = new CleanupRegistry();
  private readonly enabled: boolean;

  constructor() {
    this.enabled = isOldSafari() || isIPad4();
  }

  start(onRecover?: () => void): void {
    if (!this.enabled || typeof window === 'undefined') return;

    const onPageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) onRecover?.();
    };

    window.addEventListener('pageshow', onPageShow, { passive: true });
    this.cleanup.register(() =>
      window.removeEventListener('pageshow', onPageShow),
    );

    document.documentElement.classList.add('safari-guard-active');
    this.cleanup.register(() =>
      document.documentElement.classList.remove('safari-guard-active'),
    );
  }

  dispose(): void {
    this.cleanup.dispose();
  }
}
