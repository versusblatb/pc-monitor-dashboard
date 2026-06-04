import type { RealtimeConfig } from '../types.js';
import type { ConnectionStatus, TransportKind } from '../platform/types.js';

export interface TransportMessage<T = unknown> {
  payload: T;
  receivedAt: number;
}

export interface RealtimeTransport {
  readonly kind: TransportKind;
  connect(): void;
  disconnect(): void;
  dispose(): void;
  setConfig(config: RealtimeConfig): void;
  getStatus(): ConnectionStatus;
}

export type TransportHandler<T> = (msg: TransportMessage<T>) => void;
