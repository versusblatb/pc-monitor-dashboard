import type { TabVisibility } from '../types.js';
import { CleanupRegistry } from './cleanup-registry.js';

export type VisibilityListener = (visibility: TabVisibility) => void;

/**
 * Tracks document visibility; pauses heavy work when tab is hidden.
 */
export class VisibilityController {
  private visibility: TabVisibility =
    typeof document !== 'undefined' && document.hidden ? 'hidden' : 'visible';

  private readonly listeners = new Set<VisibilityListener>();
  private readonly cleanup = new CleanupRegistry();

  constructor() {
    if (typeof document === 'undefined') return;

    const handler = () => {
      this.visibility = document.hidden ? 'hidden' : 'visible';
      this.listeners.forEach((fn) => fn(this.visibility));
    };

    document.addEventListener('visibilitychange', handler, { passive: true });
    this.cleanup.register(() =>
      document.removeEventListener('visibilitychange', handler),
    );
  }

  getVisibility(): TabVisibility {
    return this.visibility;
  }

  isVisible(): boolean {
    return this.visibility === 'visible';
  }

  subscribe(listener: VisibilityListener): () => void {
    this.listeners.add(listener);
    listener(this.visibility);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.listeners.clear();
    this.cleanup.dispose();
  }
}
