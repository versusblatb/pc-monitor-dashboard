import type { PlatformSnapshot } from '../platform/types.js';
import { isBrowser } from '../ssr/guards.js';

export interface MetricsCacheOptions {
  storageKey: string;
  ttlMs?: number;
}

export interface CachedMetrics<T> {
  data: T;
  cachedAt: number;
  isStale: boolean;
}

/**
 * Persists last metrics for instant restore on refresh.
 */
export class MetricsCacheLayer<T> {
  private readonly ttlMs: number;

  constructor(private readonly options: MetricsCacheOptions) {
    this.ttlMs = options.ttlMs ?? 300_000;
  }

  save(data: T): void {
    if (!isBrowser()) return;
    const entry: CachedMetrics<T> = {
      data,
      cachedAt: Date.now(),
      isStale: false,
    };
    try {
      sessionStorage.setItem(this.options.storageKey, JSON.stringify(entry));
    } catch {
      /* quota */
    }
  }

  load(): CachedMetrics<T> | null {
    if (!isBrowser()) return null;
    try {
      const raw = sessionStorage.getItem(this.options.storageKey);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CachedMetrics<T>;
      const age = Date.now() - entry.cachedAt;
      return { ...entry, isStale: age > this.ttlMs };
    } catch {
      return null;
    }
  }

  hydrateSnapshot(snapshot: PlatformSnapshot<T>): PlatformSnapshot<T> {
    const cached = this.load();
    if (!cached) return snapshot;
    return {
      ...snapshot,
      metrics: snapshot.metrics ?? cached.data,
      cachedAt: cached.cachedAt,
      isStale: cached.isStale || snapshot.isStale,
    };
  }

  clear(): void {
    if (!isBrowser()) return;
    sessionStorage.removeItem(this.options.storageKey);
  }
}
