import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AnimationScaler } from '../core/animation-scaler.js';
import {
  limitChartHistory,
  memoizeChartDataset,
  shouldRedrawChart,
  type ChartSeriesPoint,
} from '../recharts/optimize.js';
import { chartEngineForTier } from '../rendering/chart-engine.js';
import type { ChartEngineConfig } from '../platform/types.js';
import type { PerformanceState, RealtimeConfig, RealtimeHealth } from '../types.js';
import { usePerformanceContext } from './context.js';

/** Full performance state + effective tier + health. */
export function useAdaptivePerformance(): {
  state: PerformanceState | null;
  tier: PerformanceState['tier'] | null;
  effectiveTier: PerformanceState['effectiveTier'] | null;
  features: PerformanceState['features'] | null;
  health: RealtimeHealth | null;
  visibility: PerformanceState['visibility'] | null;
  setPreference: PerformanceState['preference'] extends infer P
    ? (p: P) => void
    : never;
} {
  const { manager, state } = usePerformanceContext();

  const setPreference = useCallback(
    (p: PerformanceState['preference']) => manager.setPreference(p),
    [manager],
  );

  return {
    state,
    tier: state?.tier ?? null,
    effectiveTier: state?.effectiveTier ?? null,
    features: state?.features ?? null,
    health: state?.health ?? null,
    visibility: state?.visibility ?? null,
    setPreference,
  };
}

/** rAF animation loop capped by tier; respects visibility pause. */
export function useAdaptiveAnimation(): {
  scaler: AnimationScaler;
  animationFps: number;
  animationsEnabled: boolean;
  start: (cb: (time: number) => void) => void;
  stop: () => void;
} {
  const { manager, state } = usePerformanceContext();
  const scaler = manager.getAnimationScaler();
  const realtime = state?.features.realtime;
  const animationsEnabled = realtime?.animationsEnabled ?? true;
  const animationFps = state?.features.animationFps ?? 60;

  const start = useCallback(
    (cb: (time: number) => void) => {
      if (!animationsEnabled) return;
      scaler.start(cb);
    },
    [scaler, animationsEnabled],
  );

  const stop = useCallback(() => scaler.stop(), [scaler]);

  useEffect(() => () => scaler.stop(), [scaler]);

  return { scaler, animationFps, animationsEnabled, start, stop };
}

export interface AdaptiveRealtimeOptions<T> {
  /** Initial metrics merged with websocket batches. */
  initial?: T;
  onNetworkBatch?: (batch: T[]) => void;
}

/**
 * Batched WebSocket → React state path.
 * Separates network FPS from UI FPS via SmartUpdateScheduler.
 */
export function useAdaptiveRealtime<T extends Record<string, unknown>>(
  options: AdaptiveRealtimeOptions<T> = {},
): {
  data: T | null;
  realtime: RealtimeConfig | null;
  chartsPaused: boolean;
  websocketIntervalMs: number;
  chartUpdateIntervalMs: number;
  maxChartHistoryPoints: number;
  pushUpdate: (payload: T) => void;
  scheduler: ReturnType<typeof usePerformanceContext>['dashboard']['scheduler'];
  health: RealtimeHealth | null;
} {
  const { dashboard, state } = usePerformanceContext();
  const [data, setData] = useState<T | null>(options.initial ?? null);
  const mergeRef = useRef(options.initial ?? ({} as T));
  const onBatchRef = useRef(options.onNetworkBatch);
  onBatchRef.current = options.onNetworkBatch;

  const realtime = state?.features.realtime ?? null;

  useEffect(() => {
    const unsubNet = dashboard.scheduler.onNetworkFlush((batch) => {
      onBatchRef.current?.(batch as T[]);
      if (batch.length > 0) {
        mergeRef.current = { ...mergeRef.current, ...(batch[batch.length - 1] as T) };
      }
    });

    const unsubUi = dashboard.scheduler.onUiFlush((latest) => {
      if (latest != null) {
        dashboard.measureRender(() => {
          mergeRef.current = { ...mergeRef.current, ...(latest as T) };
          setData({ ...mergeRef.current });
        });
      }
    });

    return () => {
      unsubNet();
      unsubUi();
    };
  }, [dashboard]);

  const pushUpdate = useCallback(
    (payload: T) => dashboard.scheduler.pushNetworkUpdate(payload),
    [dashboard],
  );

  return {
    data,
    realtime,
    chartsPaused: realtime?.chartsPaused ?? false,
    websocketIntervalMs: realtime?.websocketIntervalMs ?? 1000,
    chartUpdateIntervalMs: realtime?.chartUpdateIntervalMs ?? 0,
    maxChartHistoryPoints: realtime?.maxChartHistoryPoints ?? 120,
    pushUpdate,
    scheduler: dashboard.scheduler,
    health: state?.health ?? null,
  };
}

/** Recharts-ready memoized series with point cap. */
export function useAdaptiveChartData<T extends ChartSeriesPoint>(
  data: readonly T[],
): T[] {
  const { state } = usePerformanceContext();
  const max = state?.features.realtime.maxChartHistoryPoints ?? 120;
  const interval = state?.features.realtime.chartUpdateIntervalMs ?? 0;
  const paused = state?.features.realtime.chartsPaused ?? false;
  const lastDraw = useRef(0);
  const [slice, setSlice] = useState<T[]>(() => limitChartHistory(data, max));

  useEffect(() => {
    if (paused) return;
    if (!shouldRedrawChart(lastDraw.current, interval)) return;
    lastDraw.current = performance.now();
    setSlice(memoizeChartDataset(data, max));
  }, [data, max, interval, paused]);

  return slice;
}

/** Chart engine config (lite SVG / full animated). */
export function useAdaptiveChartEngine(): ChartEngineConfig | null {
  const { state } = usePerformanceContext();
  if (!state) return null;
  return chartEngineForTier(
    state.effectiveTier,
    state.features.realtime.maxChartHistoryPoints,
    state.features.realtime.chartUpdateIntervalMs,
  );
}

/** Subscribe to health metrics without full performance state re-renders. */
export function useRealtimeHealth(): RealtimeHealth | null {
  const { dashboard, state } = usePerformanceContext();

  const subscribe = useCallback(
    (onStoreChange: () => void) => dashboard.health.subscribe(() => onStoreChange()),
    [dashboard],
  );

  const getSnapshot = useCallback(
    () => dashboard.health.getHealth(),
    [dashboard],
  );

  const health = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return health ?? state?.health ?? null;
}
