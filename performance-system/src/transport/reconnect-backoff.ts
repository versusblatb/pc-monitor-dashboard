export interface BackoffOptions {
  initialMs?: number;
  maxMs?: number;
  multiplier?: number;
  jitter?: boolean;
}

/**
 * Exponential backoff with jitter for WebSocket / SSE / polling reconnect.
 */
export class ReconnectBackoff {
  private attempt = 0;
  private readonly initialMs: number;
  private readonly maxMs: number;
  private readonly multiplier: number;
  private readonly jitter: boolean;

  constructor(options: BackoffOptions = {}) {
    this.initialMs = options.initialMs ?? 1000;
    this.maxMs = options.maxMs ?? 60_000;
    this.multiplier = options.multiplier ?? 1.8;
    this.jitter = options.jitter ?? true;
  }

  nextDelay(): number {
    const base = Math.min(
      this.initialMs * Math.pow(this.multiplier, this.attempt),
      this.maxMs,
    );
    this.attempt += 1;
    if (!this.jitter) return Math.round(base);
    return Math.round(base * (0.7 + Math.random() * 0.6));
  }

  reset(): void {
    this.attempt = 0;
  }

  get attempts(): number {
    return this.attempt;
  }
}
