import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getPerformanceManager,
  initPerformance,
  type PerformanceManager,
} from '../core/performance-manager.js';
import { getDashboardRuntime } from '../realtime/dashboard-runtime.js';
import type { DashboardRuntime } from '../realtime/dashboard-runtime.js';
import type { PerformanceState } from '../types.js';

export interface PerformanceProviderProps {
  children: ReactNode;
  manager?: PerformanceManager;
  autoInit?: boolean;
}

interface PerformanceContextValue {
  manager: PerformanceManager;
  dashboard: DashboardRuntime;
  state: PerformanceState | null;
}

const PerformanceContext = createContext<PerformanceContextValue | null>(null);

export function PerformanceProvider({
  children,
  manager: externalManager,
  autoInit = true,
}: PerformanceProviderProps): ReactNode {
  const manager = useMemo(
    () => externalManager ?? getPerformanceManager(),
    [externalManager],
  );

  const dashboard = useMemo(() => getDashboardRuntime(manager), [manager]);
  const [state, setState] = useState<PerformanceState | null>(manager.getState());

  useEffect(() => {
    let active = true;

    const apply = (s: PerformanceState) => {
      if (active) setState(s);
    };

    manager.subscribe(apply);

    if (autoInit && !manager.getState()) {
      void initPerformance().then((s) => active && setState(s));
    }

    return () => {
      active = false;
      manager.unsubscribe(apply);
    };
  }, [manager, autoInit]);

  const value = useMemo(
    () => ({ manager, dashboard, state }),
    [manager, dashboard, state],
  );

  return (
    <PerformanceContext.Provider value={value}>
      {children}
    </PerformanceContext.Provider>
  );
}

export function usePerformanceContext(): PerformanceContextValue {
  const ctx = useContext(PerformanceContext);
  if (!ctx) {
    throw new Error('usePerformanceContext requires <PerformanceProvider>');
  }
  return ctx;
}
