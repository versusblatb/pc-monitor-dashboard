import { useI18n } from '../i18n/I18nProvider.jsx';

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
  const { t } = useI18n();
  const typeLabel = disk.type === 'ssd' ? 'SSD' : disk.type === 'hdd' ? 'HDD' : t('disks.disk');
  const label = disk.letter ?? disk.mount ?? t('disks.disk');
  const usedPct = disk.usedPct ?? disk.usedPercent;

  return (
    <article className="disk-card">
      <div className="disk-card__head">
        <span className={`disk-badge disk-badge--${disk.type || 'disk'}`}>{typeLabel}</span>
        <span className="disk-card__letter">{label}</span>
      </div>
      <div className="disk-card__stats">
        <div>
          <span className="disk-card__pct">{usedPct ?? '—'}%</span>
          <span className="disk-card__hint">{t('disks.used')}</span>
        </div>
        <div>
          <span className="disk-card__pct">{disk.loadPct ?? 0}%</span>
          <span className="disk-card__hint">{t('disks.load')}</span>
        </div>
      </div>
      <p className="disk-card__sub">
        {disk.usedGb} / {disk.totalGb} GB
      </p>
      <MetricBar value={disk.loadPct} color="#3fb950" label={`${t('disks.load')} ${label}`} />
      <MetricBar value={disk.usedPct} color="#58a6ff" label={`${t('disks.used')} ${label}`} />
    </article>
  );
}

function ChartLegend() {
  const { t } = useI18n();
  const items = [
    { key: 'cpu', label: t('chart.legendCpu'), color: '#00e5ff' },
    { key: 'ram', label: t('chart.legendRam'), color: '#7a5cff' },
    { key: 'gpu', label: t('chart.legendGpu'), color: '#ffb020' },
  ];

  return (
    <ul className="chart-legend" aria-label={t('chart.title')}>
      {items.map((item) => (
        <li key={item.key}>
          <span className="chart-legend__swatch" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export { MetricBar, MetricCard, DiskCard, ChartLegend };
