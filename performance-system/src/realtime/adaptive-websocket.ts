import type { RealtimeConfig } from '../types.js';
import { CleanupRegistry } from './cleanup-registry.js';
import type { SmartUpdateScheduler } from './update-scheduler.js';

export interface AdaptiveWebSocketOptions<T = unknown> {
  url: string;
  scheduler: SmartUpdateScheduler<T>;
  parseMessage?: (event: MessageEvent) => T | null;
  onOpen?: () => void;
  onClose?: (ev: CloseEvent) => void;
  onError?: (ev: Event) => void;
  reconnectMs?: number;
  recordLatency?: (ms: number) => void;
}

/**
 * WebSocket wrapper: parses messages → scheduler (batched UI path).
 * Pauses processing when tab hidden; cleans up on dispose.
 */
export class AdaptiveWebSocket<T = unknown> {
  private ws: WebSocket | null = null;
  private readonly cleanup = new CleanupRegistry();
  private config: RealtimeConfig;
  private disposed = false;
  private reconnectTimer = 0;
  private lastPing = 0;

  constructor(
    private readonly options: AdaptiveWebSocketOptions<T>,
    config: RealtimeConfig,
  ) {
    this.config = config;
  }

  setConfig(config: RealtimeConfig): void {
    this.config = config;
    if (config.websocketPaused && this.ws?.readyState === WebSocket.OPEN) {
      /* keep connection; drop messages in scheduler */
    }
  }

  connect(): void {
    if (this.disposed) return;
    this.closeSocket();

    const ws = new WebSocket(this.options.url);
    this.ws = ws;

    const onMessage = (ev: MessageEvent) => {
      if (this.config.websocketPaused) return;

      const now = performance.now();
      if (this.lastPing > 0 && this.options.recordLatency) {
        this.options.recordLatency(now - this.lastPing);
      }

      const parse = this.options.parseMessage ?? defaultParse<T>;
      const payload = parse(ev);
      if (payload != null) {
        this.options.scheduler.pushNetworkUpdate(payload);
      }
    };

    ws.addEventListener('open', () => {
      this.lastPing = performance.now();
      this.options.onOpen?.();
    }, { passive: true });

    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', (ev) => {
      this.options.onClose?.(ev);
      this.scheduleReconnect();
    }, { passive: true });

    ws.addEventListener('error', (ev) => {
      this.options.onError?.(ev);
    }, { passive: true });

    this.cleanup.register(() => {
      ws.removeEventListener('message', onMessage);
      this.closeSocket();
    });
  }

  send(data: string | ArrayBufferLike | Blob): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.lastPing = performance.now();
      this.ws.send(data);
    }
  }

  markPing(): void {
    this.lastPing = performance.now();
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.cleanup.dispose();
  }

  private closeSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    const ms = this.options.reconnectMs ?? 3000;
    this.reconnectTimer = window.setTimeout(() => this.connect(), ms);
    this.cleanup.register(() => clearTimeout(this.reconnectTimer));
  }
}

function defaultParse<T>(ev: MessageEvent): T | null {
  try {
    return JSON.parse(ev.data as string) as T;
  } catch {
    return null;
  }
}
