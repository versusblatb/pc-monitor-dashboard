import { useEffect, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { api } from '../api/client.js';
import { getChartConfig, resolveTier } from '../adaptive.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

export function HistoryPage() {
  const { t } = useI18n();
  const [range, setRange] = useState('1h');
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const chartCfg = getChartConfig(resolveTier());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api.history(range)
      .then((d) => {
        if (alive) {
          setPoints(d.points ?? []);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [range]);

  const data = points.map((p) => ({
    time: new Date(p.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    cpu: p.cpu,
    gpu: p.gpu,
    ram: p.ram,
  }));

  return (
    <section className="chart-panel">
      <div className="chart-panel__head">
        <h2 className="section-title">{t('history.title')}</h2>
        <div className="perf-modes">
          {['1h', '24h', '7d'].map((r) => (
            <button key={r} type="button" className={`perf-btn ${range === r ? 'is-active' : ''}`} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
      {loading && <p className="muted">{t('history.loading')}</p>}
      {error && <p className="banner banner--offline">{error}</p>}
      {!loading && !error && points.length === 0 && <p className="muted">{t('history.empty')}</p>}
      {points.length > 0 && (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: '#8b949e', fontSize: 11 }} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fill: '#8b949e', fontSize: 11 }} />
              <Tooltip />
              <Line dataKey="cpu" stroke="#00e5ff" dot={false} isAnimationActive={chartCfg.animate} />
              <Line dataKey="ram" stroke="#7a5cff" dot={false} isAnimationActive={chartCfg.animate} />
              <Line dataKey="gpu" stroke="#ffb020" dot={false} isAnimationActive={chartCfg.animate} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
