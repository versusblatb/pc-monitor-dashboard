import { useI18n } from '../i18n/I18nProvider.jsx';

function fmtBps(v) {
  if (v == null) return '—';
  if (v < 1024) return `${v} B/s`;
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(1)} KB/s`;
  return `${(v / 1024 ** 2).toFixed(1)} MB/s`;
}

export function Network({ metrics }) {
  const { t } = useI18n();
  const n = metrics?.network ?? {};
  const rows = [
    [t('network.interface'), n.interface],
    [t('network.type'), n.type],
    [t('network.ipv4'), n.ipv4],
    [t('network.download'), fmtBps(n.downloadBps)],
    [t('network.upload'), fmtBps(n.uploadBps)],
    [t('network.ping'), n.pingMs != null ? `${n.pingMs} ms` : null],
    [t('network.linkSpeed'), n.linkSpeedMbps != null ? `${n.linkSpeedMbps} Mbps` : null],
  ];

  return (
    <section className="panel">
      <h2 className="section-title">{t('network.title')}</h2>
      <dl className="info-grid">
        {rows.map(([k, v]) => (
          <div key={k} className="info-row">
            <dt>{k}</dt>
            <dd>{v ?? '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
