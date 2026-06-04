import type { RealtimeConfig } from '../types.js';
import type { ConnectionStatus } from '../platform/types.js';
import { CleanupRegistry } from '../realtime/cleanup-registry.js';
import { ReconnectBackoff } from './reconnect-backoff.js';
import type { RealtimeTransport, TransportHandler } from './types.js';

export interface PollingTransportOptions<T> {
  url: string;
  headers?: Record<string, string>;
  parse?: (raw: string) => T | null;
  onStatus?: (status: ConnectionStatus) => void;
}

export class PollingTransport<T = unknown> implements RealtimeTransport {
  readonly kind = 'polling' as const;
  private status: ConnectionStatus = 'connecting';
  private readonly cleanup = new CleanupRegistry();
  private readonly backoff = new ReconnectBackoff();
  private config: RealtimeConfig;
  private disposed = false;
  private active = false;
  private inflight = false;

  constructor(
    private readonly options: PollingTransportOptions<T>,
    private readonly handler: TransportHandler<T>,
    config: RealtimeConfig,
  ) {
    this.config = config;
  }

  setConfig(config: RealtimeConfig): void {
    this.config = config;
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  connect(): void {
    if (this.disposed) return;
    this.active = true;
    this.setStatus('connecting');
    this.tick();
    this.cleanup.registerInterval(() => this.tick(), 250);
  }

  disconnect(): void {
    this.active = false;
    this.setStatus('offline');
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.cleanup.dispose();
  }

  private async tick(): Promise<void> {
    if (!this.active || this.disposed || this.inflight) return;
    if (this.config.websocketPaused) return;

    const interval = this.config.websocketIntervalMs;
    const now = performance.now();
    if (this.lastPoll && now - this.lastPoll < interval) return;

    this.inflight = true;
    this.lastPoll = now;

    try {
      const res = await fetch(this.options.url, {
        headers: this.options.headers,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`poll ${res.status}`);
      const raw = await res.text();
      const parse = this.options.parse ?? defaultParse<T>;
      const payload = parse(raw);
      if (payload != null) {
        this.backoff.reset();
        this.setStatus('connected');
        this.handler({ payload, receivedAt: Date.now() });
      }
    } catch {
      this.setStatus('reconnecting');
      const delay = this.backoff.nextDelay();
      await new Promise((r) => setTimeout(r, Math.min(delay, interval)));
    } finally {
      this.inflight = false;
    }
  }

  private lastPoll = 0;

  private setStatus(s: ConnectionStatus): void {
    this.status = s;
    this.options.onStatus?.(s);
  }
}

function defaultParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
