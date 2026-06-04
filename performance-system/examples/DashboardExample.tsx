/**
 * Production dashboard example — RealtimeDashboardProvider + Recharts.
 */
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import {
  RealtimeDashboardProvider,
  useAdaptiveChartData,
  useAdaptiveChartEngine,
  useAdaptivePerformance,
  useAdaptiveRealtime,
  useDashboardSnapshot,
} from '../src/react/index.js';
import { rechartsPropsFromEngine } from '../src/rendering/chart-engine.js';

type Metrics = { t: number; cpu: number; ram: number };

function Dashboard() {
  const { effectiveTier } = useAdaptivePerformance();
  const snapshot = useDashboardSnapshot<Metrics>();
  const { data } = useAdaptiveRealtime<Metrics>();
  const engine = useAdaptiveChartEngine();
  const chartProps = engine ? rechartsPropsFromEngine(engine) : {};

  const series = useAdaptiveChartData(
    data ? [{ t: data.t, cpu: data.cpu, ram: data.ram }] : [],
  );

  return (
    <div data-live="true" data-stale={snapshot.isStale} className="dashboard-shell">
      <p>
        {effectiveTier} · {snapshot.activeTransport} · {snapshot.connectionStatus}
        {snapshot.isStale && ' · stale'}
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={series}>
          <Line type="monotone" dataKey="cpu" stroke="#00e5ff" {...chartProps} />
          <Line type="monotone" dataKey="ram" stroke="#7a5cff" {...chartProps} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function App() {
  return (
    <RealtimeDashboardProvider<Metrics>
      platformOptions={{
        endpoints: {
          websocket: 'wss://api.example/metrics',
          sse: 'https://api.example/metrics/stream',
          polling: 'https://api.example/metrics/latest',
        },
        devMode: process.env.NODE_ENV === 'development',
      }}
    >
      <Dashboard />
    </RealtimeDashboardProvider>
  );
}
