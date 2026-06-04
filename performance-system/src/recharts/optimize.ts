/**
 * Recharts / time-series helpers — limit points, stable references, windowed slices.
 */

let chartDataCacheKey = '';
let chartDataCacheRef: unknown[] = [];

export interface ChartSeriesPoint {
  t: number;
  [key: string]: number;
}

export function limitChartHistory<T>(data: readonly T[], maxPoints: number): T[] {
  if (data.length <= maxPoints) return data as T[];
  return data.slice(data.length - maxPoints) as T[];
}

/**
 * Returns stable array reference when contents are shallow-equal (reduces Recharts re-render).
 */
export function memoizeChartDataset<T extends ChartSeriesPoint>(
  data: readonly T[],
  maxPoints: number,
): T[] {
  const limited = limitChartHistory(data, maxPoints);
  const key = `${limited.length}:${limited[0]?.t ?? ''}:${limited[limited.length - 1]?.t ?? ''}`;

  if (key === chartDataCacheKey && chartDataCacheRef.length === limited.length) {
    return chartDataCacheRef as T[];
  }

  chartDataCacheKey = key;
  chartDataCacheRef = [...limited];
  return chartDataCacheRef as T[];
}

/** Virtualized window — only last `windowSize` points for canvas redraw. */
export function virtualizedChartSlice<T>(
  data: readonly T[],
  windowSize: number,
  offset = 0,
): T[] {
  const end = data.length - offset;
  const start = Math.max(0, end - windowSize);
  return data.slice(start, end) as T[];
}

export function shouldRedrawChart(
  lastDrawAt: number,
  intervalMs: number,
  now = performance.now(),
): boolean {
  if (intervalMs <= 0) return true;
  return now - lastDrawAt >= intervalMs;
}

/** Downsample for lite mode — every nth point. */
export function downsampleSeries<T>(data: readonly T[], step: number): T[] {
  if (step <= 1) return data as T[];
  return data.filter((_, i) => i % step === 0) as T[];
}

export function mergeMetricBatch<T extends Record<string, unknown>>(
  current: T,
  batch: T[],
): T {
  if (batch.length === 0) return current;
  return { ...current, ...batch[batch.length - 1] };
}
