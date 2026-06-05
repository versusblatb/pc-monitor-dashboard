import { useI18n } from '../i18n/I18nProvider.jsx';
import { formatMetricValue, resolveMetricState } from '../lib/metrics-view.js';

function fmtBps(v) {
  if (v == null) return null;
  if (v < 1024) return `${v} B/s`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB/s`;
  return `${(v / 1024 ** 2).toFixed(1)} MB/s`;
}

export function Network({ metrics, online }) {
  const { t } = useI18n();
  const n = metrics?.network ?? {};
  const ctx = { online, metrics };

  const row = (label, raw, display = raw) => {
    const state = resolveMetricState(raw, ctx, { requireV2: true });
    const value = display != null && state === 'value' ? display : formatMetricValue(display, state, t);
    return [label, value, state];
  };

  const rows = [
    row(t('network.interface'), n.interface),
    row(t('network.type'), n.type),
    row(t('network.ipv4'), n.ipv4),
    row(t('network.download'), n.downloadBps, fmtBps(n.downloadBps)),
    row(t('network.upload'), n.uploadBps, fmtBps(n.uploadBps)),
    row(t('network.ping'), n.pingMs, n.pingMs != null ? `${n.pingMs} ms` : null),
    row(t('network.linkSpeed'), n.linkSpeedMbps, n.linkSpeedMbps != null ? `${n.linkSpeedMbps} Mbps` : null),
  ];

  return (
    <section className="panel">
      <h2 className="section-title">{t('network.title')}</h2>
      {metrics?.schemaVersion != null && metrics.schemaVersion < 2 && (
        <p className="muted">{t('metricsState.legacyAgent')}</p>
      )}
      <dl className="info-grid">
        {rows.map(([k, v, state]) => (
          <div key={k} className="info-row">
            <dt>{k}</dt>
            <dd className={state !== 'value' ? 'muted' : undefined}>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
