import type { RealtimeConfig } from '../types.js';
import type {
  ConnectionStatus,
  TransportEndpoints,
  TransportKind,
} from '../platform/types.js';
import { CleanupRegistry } from '../realtime/cleanup-registry.js';
import type { SmartUpdateScheduler } from '../realtime/update-scheduler.js';
import { PollingTransport } from './polling-transport.js';
import { SseTransport } from './sse-transport.js';
import type { TransportHandler } from './types.js';
import { WebSocketTransport } from './websocket-transport.js';

export interface TransportManagerOptions<T> {
  endpoints: TransportEndpoints;
  scheduler: SmartUpdateScheduler<T>;
  getConfig: () => RealtimeConfig;
  parse?: (raw: string) => T | null;
  pollHeaders?: Record<string, string>;
  onStatus?: (status: ConnectionStatus, transport: TransportKind | null) => void;
  onLatency?: (ms: number) => void;
  failuresBeforeFallback?: number;
}

const FALLBACK_ORDER: TransportKind[] = ['websocket', 'sse', 'polling'];

/**
 * Auto-switching transport: WebSocket → SSE → polling.
 */
export class TransportManager<T = unknown> {
  private active: TransportKind | null = null;
  private transport: import('./types.js').RealtimeTransport | null = null;
  private readonly cleanup = new CleanupRegistry();
  private config: RealtimeConfig;
  private failureCount = 0;
  private readonly failuresBeforeFallback: number;
  private disposed = false;

  constructor(private readonly options: TransportManagerOptions<T>) {
    this.config = options.getConfig();
    this.failuresBeforeFallback = options.failuresBeforeFallback ?? 3;
  }

  connect(): void {
    this.disposed = false;
    this.tryConnect(FALLBACK_ORDER[0]);
  }

  setConfig(config?: RealtimeConfig): void {
    this.config = config ?? this.options.getConfig();
    this.transport?.setConfig(this.config);
  }

  getActiveTransport(): TransportKind | null {
    return this.active;
  }

  getStatus(): ConnectionStatus {
    return this.transport?.getStatus() ?? 'offline';
  }

  disconnect(): void {
    this.transport?.disconnect();
  }

  dispose(): void {
    this.disposed = true;
    this.transport?.dispose();
    this.transport = null;
    this.cleanup.dispose();
  }

  private tryConnect(kind: TransportKind): void {
    if (this.disposed) return;

    const url = this.options.endpoints[kind];
    if (!url) {
      this.fallbackFrom(kind);
      return;
    }

    this.transport?.dispose();
    this.active = kind;

    const handler: TransportHandler<T> = ({ payload }) => {
      this.failureCount = 0;
      this.options.scheduler.pushNetworkUpdate(payload);
    };

    const onStatus = (status: ConnectionStatus) => {
      this.options.onStatus?.(status, this.active);
      if (status === 'reconnecting' || status === 'degraded') {
        this.failureCount += 1;
        if (this.failureCount >= this.failuresBeforeFallback) {
          this.fallbackFrom(kind);
        }
      }
      if (status === 'connected') this.failureCount = 0;
    };

    if (kind === 'websocket') {
      this.transport = new WebSocketTransport<T>(
        {
          url,
          parse: this.options.parse,
          onLatency: this.options.onLatency,
          onStatus,
        },
        handler,
        this.config,
      );
    } else if (kind === 'sse') {
      this.transport = new SseTransport<T>(
        { url, parse: this.options.parse, onStatus },
        handler,
        this.config,
      );
    } else {
      this.transport = new PollingTransport<T>(
        {
          url,
          headers: this.options.pollHeaders,
          parse: this.options.parse,
          onStatus,
        },
        handler,
        this.config,
      );
    }

    this.transport.connect();
    this.cleanup.register(() => this.transport?.dispose());
  }

  private fallbackFrom(kind: TransportKind): void {
    const idx = FALLBACK_ORDER.indexOf(kind);
    const next = FALLBACK_ORDER[idx + 1];
    if (next) {
      this.failureCount = 0;
      this.tryConnect(next);
      return;
    }
    this.options.onStatus?.('offline', null);
  }
}
