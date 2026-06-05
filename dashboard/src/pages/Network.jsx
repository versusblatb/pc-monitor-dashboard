import { useI18n } from '../i18n/I18nProvider.jsx';
import { formatNetworkSpeed } from '../lib/format-metrics.js';
import { formatMetricValue, resolveMetricState } from '../lib/metrics-view.js';

export function Network({ metrics, online }) {
  const { t } = useI18n();
  const n = metrics?.network ?? {};
  const ctx = { online, metrics };

  const row = (label, raw, display = raw, pending = true) => {
    const state = resolveMetricState(raw, ctx, { requireV2: true, pendingIfOnline: pending });
    const value = display != null && state === 'value' ? display : formatMetricValue(display, state, t);
    return [label, value, state];
  };

  const bpsPending = online && Boolean(n.interface) && n.downloadBps == null && n.uploadBps == null;

  const rows = [
    row(t('network.interface'), n.interface),
    row(t('network.type'), n.type),
    row(t('network.ipv4'), n.ipv4),
    row(t('network.download'), n.downloadBps, formatNetworkSpeed(n.downloadBps), bpsPending),
    row(t('network.upload'), n.uploadBps, formatNetworkSpeed(n.uploadBps), bpsPending),
    row(t('network.ping'), n.pingMs, n.pingMs != null ? `${Math.round(n.pingMs)} ms` : null, false),
    row(t('network.linkSpeed'), n.linkSpeedMbps, n.linkSpeedMbps != null ? `${Math.round(n.linkSpeedMbps)} Mbps` : null, false),
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
