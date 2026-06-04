function MetricBar({ value, color, label }) {
  const v = Math.min(100, Math.max(0, value ?? 0));
  return (
    <div className="metric-bar" aria-label={`${label} ${v}%`}>
      <div className="metric-bar__fill" style={{ width: `${v}%`, background: color }} />
    </div>
  );
}

function MetricCard({ label, value, unit = '%', sub, color, accent, children }) {
  return (
    <article className="metric-card" style={{ '--accent': accent }}>
      <div className="metric-card__head">
        <span className="metric-card__dot" style={{ background: color }} />
        <span className="metric-card__label">{label}</span>
      </div>
      <div className="metric-card__value">
        <span className="metric-card__num">{value ?? '—'}</span>
        {value != null && <span className="metric-card__unit">{unit}</span>}
      </div>
      {sub && <p className="metric-card__sub">{sub}</p>}
      {children}
    </article>
  );
}

function DiskCard({ disk }) {
  const typeLabel = disk.type === 'ssd' ? 'SSD' : disk.type === 'hdd' ? 'HDD' : 'Disk';
  return (
    <article className="disk-card">
      <div className="disk-card__head">
        <span className={`disk-badge disk-badge--${disk.type}`}>{typeLabel}</span>
        <span className="disk-card__letter">{disk.letter}</span>
      </div>
      <div className="disk-card__stats">
        <div>
          <span className="disk-card__pct">{disk.usedPct}%</span>
          <span className="disk-card__hint">занято</span>
        </div>
        <div>
          <span className="disk-card__pct">{disk.loadPct}%</span>
          <span className="disk-card__hint">нагрузка</span>
        </div>
      </div>
      <p className="disk-card__sub">
        {disk.usedGb} / {disk.totalGb} GB
      </p>
      <MetricBar value={disk.loadPct} color="#3fb950" label={`Нагрузка ${disk.letter}`} />
      <MetricBar value={disk.usedPct} color="#58a6ff" label={`Заполнение ${disk.letter}`} />
    </article>
  );
}

const LEGEND = [
  { key: 'cpu', label: 'CPU — процессор', color: '#00e5ff' },
  { key: 'ram', label: 'RAM — память', color: '#7a5cff' },
  { key: 'gpu', label: 'GPU — видеокарта', color: '#ffb020' },
];

export { MetricBar, MetricCard, DiskCard, LEGEND };
