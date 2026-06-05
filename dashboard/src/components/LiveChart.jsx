import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { getChartConfig, resolveTier } from '../adaptive.js';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function LiveChart({ history }) {
  const chartCfg = getChartConfig(resolveTier());
  const data = history.map((p) => ({
    time: formatTime(p.ts),
    cpu: p.cpu,
    gpu: p.gpuAvailable !== false ? p.gpu : null,
    ram: p.ram,
  }));

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#8b949e', fontSize: 11 }} interval="preserveStartEnd" minTickGap={40} />
          <YAxis domain={[0, 100]} tick={{ fill: '#8b949e', fontSize: 11 }} unit="%" />
          <Tooltip contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10 }} formatter={(v, n) => [`${v}%`, n]} />
          <Line type="monotone" dataKey="cpu" name="CPU" stroke="#00e5ff" strokeWidth={2.5} dot={false} isAnimationActive={chartCfg.animate} />
          <Line type="monotone" dataKey="ram" name="RAM" stroke="#7a5cff" strokeWidth={2.5} dot={false} isAnimationActive={chartCfg.animate} />
          <Line type="monotone" dataKey="gpu" name="GPU" stroke="#ffb020" strokeWidth={2.5} dot={false} isAnimationActive={chartCfg.animate} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
