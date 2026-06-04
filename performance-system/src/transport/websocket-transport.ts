import type { RealtimeConfig } from '../types.js';
import type { ConnectionStatus } from '../platform/types.js';
import { CleanupRegistry } from '../realtime/cleanup-registry.js';
import { ReconnectBackoff } from './reconnect-backoff.js';
import type { RealtimeTransport, TransportHandler } from './types.js';

export interface WebSocketTransportOptions<T> {
  url: string;
  parse?: (raw: string) => T | null;
  onLatency?: (ms: number) => void;
  onStatus?: (status: ConnectionStatus) => void;
}

export class WebSocketTransport<T = unknown> implements RealtimeTransport {
  readonly kind = 'websocket' as const;
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'connecting';
  private readonly cleanup = new CleanupRegistry();
  private readonly backoff = new ReconnectBackoff();
  private config: RealtimeConfig;
  private disposed = false;
  private reconnectTimer = 0;

  constructor(
    private readonly options: WebSocketTransportOptions<T>,
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
    this.setStatus('connecting');
    this.closeSocket();

    const ws = new WebSocket(this.options.url);
    this.ws = ws;
    const openedAt = performance.now();

    const onMessage = (ev: MessageEvent) => {
      if (this.config.websocketPaused) return;
      const parse = this.options.parse ?? defaultParse<T>;
      const payload = parse(String(ev.data));
      if (payload == null) return;
      this.options.onLatency?.(performance.now() - openedAt);
      this.handler({ payload, receivedAt: Date.now() });
    };

    ws.addEventListener('open', () => {
      this.backoff.reset();
      this.setStatus('connected');
    }, { passive: true });

    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', () => {
      this.scheduleReconnect();
    }, { passive: true });

    ws.addEventListener('error', () => {
      this.setStatus('degraded');
    }, { passive: true });

    this.cleanup.register(() => {
      ws.removeEventListener('message', onMessage);
      this.closeSocket();
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.closeSocket();
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
    this.cleanup.register(() => clearTimeout(this.reconnectTimer));
  }

  private closeSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
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
