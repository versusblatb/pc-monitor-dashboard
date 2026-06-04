import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  applyPerfMode,
  getChartConfig,
  getPerfMode,
  resolveTier,
  setPerfMode,
} from './adaptive.js';
import { DiskCard, LEGEND, MetricBar, MetricCard } from './components/MetricsUI.jsx';
import { useMetrics } from './useMetrics.js';
import './App.css';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function App() {
  const { online, wsConnected, metrics, history, hostname } = useMetrics();
  const [mode, setMode] = useState(getPerfMode);
  const tier = resolveTier(mode);
  const chartCfg = getChartConfig(tier);

  useEffect(() => {
    applyPerfMode(mode);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => applyPerfMode(mode);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const chartData = history.map((p) => ({
    time: formatTime(p.ts),
    cpu: p.cpu,
    gpu: p.gpuAvailable !== false ? p.gpu : null,
    ram: p.ram,
  }));

  const disks = metrics?.disks ?? [];

  return (
    <div className="app">
      <div className="app-glow" aria-hidden="true" />

      <header className="header">
        <div>
          <p className="eyebrow">Realtime Monitor</p>
          <h1>PC Monitor</h1>
          <p className="subtitle">{hostname}</p>
        </div>
        <div
          className={`status-pill ${online ? 'status-pill--online' : 'status-pill--offline'}`}
          role="status"
        >
          <span className="status-dot" />
          {online ? 'В сети' : 'Офлайн'}
          {!wsConnected && online && ' · poll'}
        </div>
      </header>

      {!online && (
        <div className="banner banner--offline">
          Агент недоступен — показываем последние данные. Переподключение…
        </div>
      )}

      <section className="metrics-grid">
        <MetricCard
          label="CPU"
          value={metrics?.cpu}
          sub="Загрузка процессора"
          color="#00e5ff"
          accent="rgba(0,229,255,0.12)"
        >
          <MetricBar value={metrics?.cpu} color="#00e5ff" label="CPU" />
        </MetricCard>

        <MetricCard
          label="GPU"
          value={metrics?.gpuAvailable !== false ? metrics?.gpu : '—'}
          sub={metrics?.gpuName ?? 'Видеокарта'}
          color="#ffb020"
          accent="rgba(255,176,32,0.12)"
        >
          <MetricBar value={metrics?.gpu} color="#ffb020" label="GPU" />
        </MetricCard>

        <MetricCard
          label="RAM"
          value={metrics?.ram}
          sub={
            metrics?.ramUsedGb != null
              ? `${metrics.ramUsedGb} / ${metrics.ramTotalGb} GB`
              : 'Оперативная память'
          }
          color="#7a5cff"
          accent="rgba(122,92,255,0.12)"
        >
          <MetricBar value={metrics?.ram} color="#7a5cff" label="RAM" />
        </MetricCard>
      </section>

      {disks.length > 0 && (
        <section className="disks-section">
          <h2 className="section-title">Диски</h2>
          <div className="disks-grid">
            {disks.map((d) => (
              <DiskCard key={d.letter} disk={d} />
            ))}
          </div>
        </section>
      )}

      <section className="chart-panel">
        <div className="chart-panel__head">
          <h2 className="section-title">График в реальном времени</h2>
          <ul className="chart-legend" aria-label="Обозначения линий">
            {LEGEND.map((item) => (
              <li key={item.key}>
                <span className="chart-legend__swatch" style={{ background: item.color }} />
                {item.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fill: '#8b949e', fontSize: 11 }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis domain={[0, 100]} tick={{ fill: '#8b949e', fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: 10,
                }}
                formatter={(v, name) => [`${v}%`, name]}
              />
              <Legend wrapperStyle={{ display: 'none' }} />
              <Line
                type="monotone"
                dataKey="cpu"
                name="CPU"
                stroke="#00e5ff"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={chartCfg.animate}
              />
              <Line
                type="monotone"
                dataKey="ram"
                name="RAM"
                stroke="#7a5cff"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={chartCfg.animate}
              />
              <Line
                type="monotone"
                dataKey="gpu"
                name="GPU"
                stroke="#ffb020"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={chartCfg.animate}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="chart-hint">
          <strong style={{ color: '#00e5ff' }}>Голубая</strong> — CPU ·{' '}
          <strong style={{ color: '#7a5cff' }}>Фиолетовая</strong> — RAM ·{' '}
          <strong style={{ color: '#ffb020' }}>Оранжевая</strong> — GPU
        </p>
      </section>

      <footer className="perf-bar">
        <span>Производительность UI</span>
        <div className="perf-modes" role="group" aria-label="Performance mode">
          {[
            ['auto', 'Auto'],
            ['lite', 'Lite'],
            ['full', 'Full'],
          ].map(([m, label]) => (
            <button
              key={m}
              type="button"
              className={`perf-btn ${mode === m ? 'is-active' : ''}`}
              onClick={() => {
                setPerfMode(m);
                setMode(m);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
