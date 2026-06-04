import type { ConnectionStatus } from '../platform/types.js';
import { CleanupRegistry } from '../realtime/cleanup-registry.js';

export type OfflineListener = (offline: boolean, status: ConnectionStatus) => void;

/**
 * Offline-aware UX: cached metrics + reconnect styling.
 */
export class OfflineStateManager {
  private offline = true;
  private status: ConnectionStatus = 'connecting';
  private readonly listeners = new Set<OfflineListener>();
  private readonly cleanup = new CleanupRegistry();
  private reconnectAnim = false;

  subscribe(fn: OfflineListener): () => void {
    this.listeners.add(fn);
    fn(this.offline, this.status);
    return () => this.listeners.delete(fn);
  }

  setConnectionStatus(status: ConnectionStatus): void {
    const wasOffline = this.offline;
    this.status = status;
    this.offline = status === 'offline' || status === 'reconnecting';

    if (wasOffline && status === 'connected') {
      this.triggerReconnectAnimation();
    }

    this.emit();
    this.applyDocumentState();
  }

  isOffline(): boolean {
    return this.offline;
  }

  isReconnecting(): boolean {
    return this.status === 'reconnecting';
  }

  shouldShowStaleIndicator(isStale: boolean): boolean {
    return this.offline || isStale;
  }

  dispose(): void {
    this.listeners.clear();
    this.cleanup.dispose();
    document.documentElement.classList.remove('platform-offline', 'platform-reconnecting');
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn(this.offline, this.status));
  }

  private applyDocumentState(): void {
    const root = document.documentElement;
    root.classList.toggle('platform-offline', this.offline);
    root.classList.toggle('platform-reconnecting', this.reconnectAnim);
    root.dataset.connectionStatus = this.status;
  }

  private triggerReconnectAnimation(): void {
    this.reconnectAnim = true;
    this.applyDocumentState();
    this.cleanup.registerTimeout(() => {
      this.reconnectAnim = false;
      this.applyDocumentState();
    }, 600);
  }
}
