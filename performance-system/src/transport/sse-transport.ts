import type { RealtimeConfig } from '../types.js';
import type { ConnectionStatus } from '../platform/types.js';
import { CleanupRegistry } from '../realtime/cleanup-registry.js';
import { ReconnectBackoff } from './reconnect-backoff.js';
import type { RealtimeTransport, TransportHandler } from './types.js';

export interface SseTransportOptions<T> {
  url: string;
  parse?: (raw: string) => T | null;
  onStatus?: (status: ConnectionStatus) => void;
}

export class SseTransport<T = unknown> implements RealtimeTransport {
  readonly kind = 'sse' as const;
  private source: EventSource | null = null;
  private status: ConnectionStatus = 'connecting';
  private readonly cleanup = new CleanupRegistry();
  private readonly backoff = new ReconnectBackoff();
  private config: RealtimeConfig;
  private disposed = false;
  private reconnectTimer = 0;

  constructor(
    private readonly options: SseTransportOptions<T>,
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
    if (this.disposed || typeof EventSource === 'undefined') {
      this.setStatus('offline');
      return;
    }
    this.close();
    this.setStatus('connecting');

    const source = new EventSource(this.options.url);
    this.source = source;
    const parse = this.options.parse ?? defaultParse<T>;

    const onMessage = (ev: MessageEvent) => {
      if (this.config.websocketPaused) return;
      const payload = parse(String(ev.data));
      if (payload == null) return;
      this.handler({ payload, receivedAt: Date.now() });
    };

    source.addEventListener('message', onMessage);
    source.addEventListener('open', () => {
      this.backoff.reset();
      this.setStatus('connected');
    });
    source.addEventListener('error', () => {
      this.close();
      this.scheduleReconnect();
    });

    this.cleanup.register(() => {
      source.removeEventListener('message', onMessage);
      this.close();
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.close();
    this.setStatus('offline');
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this.cleanup.dispose();
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    this.setStatus('reconnecting');
    const delay = this.backoff.nextDelay();
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  private close(): void {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }

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
