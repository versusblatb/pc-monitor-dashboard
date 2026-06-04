import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  RealtimeDashboardPlatform,
} from '../platform/realtime-dashboard-platform.js';
import type {
  PlatformSnapshot,
  RealtimeDashboardPlatformOptions,
} from '../platform/types.js';
import { PerformanceProvider } from './context.js';
import { PerformanceErrorBoundary } from './error-boundary.js';

interface PlatformContextValue<T extends Record<string, unknown>> {
  platform: RealtimeDashboardPlatform<T>;
  snapshot: PlatformSnapshot<T>;
}

const PlatformContext = createContext<PlatformContextValue<Record<string, unknown>> | null>(
  null,
);

export interface RealtimeDashboardProviderProps<T extends Record<string, unknown>> {
  children: ReactNode;
  platformOptions: RealtimeDashboardPlatformOptions<T>;
}

export function RealtimeDashboardProvider<T extends Record<string, unknown>>({
  children,
  platformOptions,
}: RealtimeDashboardProviderProps<T>): ReactNode {
  return (
    <PerformanceProvider>
      <PerformanceErrorBoundary>
        <RealtimeDashboardInner options={platformOptions}>{children}</RealtimeDashboardInner>
      </PerformanceErrorBoundary>
    </PerformanceProvider>
  );
}

function RealtimeDashboardInner<T extends Record<string, unknown>>({
  children,
  options,
}: {
  children: ReactNode;
  options: RealtimeDashboardPlatformOptions<T>;
}): ReactNode {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [platform, setPlatform] = useState<RealtimeDashboardPlatform<T> | null>(null);
  const [snapshot, setSnapshot] = useState<PlatformSnapshot<T> | null>(null);

  useEffect(() => {
    let plat: RealtimeDashboardPlatform<T> | null = null;
    let timer = 0;
    let active = true;

    void RealtimeDashboardPlatform.create(optionsRef.current).then(async (p) => {
      if (!active) return;
      plat = p;
      setPlatform(p);
      const snap = await p.init();
      if (!active) return;
      setSnapshot(snap);
      p.connect();
      timer = window.setInterval(() => {
        setSnapshot(p.getSnapshot());
      }, 1000);
    });

    return () => {
      active = false;
      clearInterval(timer);
      plat?.dispose();
    };
  }, []);

  const value = useMemo(() => {
    if (!platform || !snapshot) return null;
    return { platform, snapshot };
  }, [platform, snapshot]);

  if (!value) return null;

  return (
    <PlatformContext.Provider value={value as PlatformContextValue<Record<string, unknown>>}>
      {children}
    </PlatformContext.Provider>
  );
}

export function useRealtimeDashboardPlatform<
  T extends Record<string, unknown> = Record<string, unknown>,
>(): PlatformContextValue<T> {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error('useRealtimeDashboardPlatform requires <RealtimeDashboardProvider>');
  }
  return ctx as PlatformContextValue<T>;
}

export function useDashboardSnapshot<
  T extends Record<string, unknown> = Record<string, unknown>,
>(): PlatformSnapshot<T> {
  return useRealtimeDashboardPlatform<T>().snapshot;
}
