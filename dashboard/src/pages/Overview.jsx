import { MetricBar, MetricCard, DiskCard, ChartLegend } from '../components/MetricsUI.jsx';
import { LiveChart } from '../components/LiveChart.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

export function Overview({ metrics, history, online, status, lastSeen, wsConnected, stale }) {
  const { t, locale } = useI18n();
  const disks = metrics?.disks ?? [];
  const cpuTemp = metrics?.cpuInfo?.temperature;
  const gpuTemp = metrics?.gpuInfo?.temperature;
  const statusLabel = t(`status.${status}`) !== `status.${status}` ? t(`status.${status}`) : status;

  return (
    <>
      {!online && (
        <div className="banner banner--offline">
          {t('agent.offline')} — {stale ? t('agent.stale') : t('agent.waiting')}
        </div>
      )}
      <div className="status-row">
        <span className="status-chip">
          {t('status.label')}: <strong>{statusLabel}</strong>
        </span>
        {lastSeen && (
          <span className="status-chip">
            {t('lastSeen')}: {new Date(lastSeen).toLocaleTimeString(locale)}
          </span>
        )}
        <span className="status-chip">
          {t('conn.ws')}: {wsConnected ? t('conn.connected') : t('conn.fallback')}
        </span>
      </div>
      <section className="metrics-grid">
        <MetricCard label={t('metrics.cpu')} value={metrics?.cpu} sub={metrics?.cpuInfo?.model ?? t('metrics.processor')} color="#00e5ff" accent="rgba(0,229,255,0.12)">
          <MetricBar value={metrics?.cpu} color="#00e5ff" label={t('metrics.cpu')} />
        </MetricCard>
        <MetricCard label={t('metrics.gpu')} value={metrics?.gpuAvailable !== false ? metrics?.gpu : '—'} sub={metrics?.gpuName ?? metrics?.gpuInfo?.model ?? t('metrics.gpuCard')} color="#ffb020" accent="rgba(255,176,32,0.12)">
          <MetricBar value={metrics?.gpu} color="#ffb020" label={t('metrics.gpu')} />
        </MetricCard>
        <MetricCard label={t('metrics.ram')} value={metrics?.ram} sub={metrics?.ramUsedGb != null ? `${metrics.ramUsedGb} / ${metrics.ramTotalGb} GB` : t('metrics.memory')} color="#7a5cff" accent="rgba(122,92,255,0.12)">
          <MetricBar value={metrics?.ram} color="#7a5cff" label={t('metrics.ram')} />
        </MetricCard>
        {(cpuTemp != null || gpuTemp != null) && (
          <MetricCard label={t('metrics.temp')} value={cpuTemp ?? gpuTemp} unit="°C" sub={`CPU ${cpuTemp ?? '—'} · GPU ${gpuTemp ?? '—'}`} color="#f85149" accent="rgba(248,81,73,0.12)" />
        )}
      </section>
      {disks.length > 0 && (
        <section className="disks-section">
          <h2 className="section-title">{t('disks.title')}</h2>
          <div className="disks-grid">{disks.map((d) => <DiskCard key={d.letter ?? d.mount} disk={d} />)}</div>
        </section>
      )}
      <section className="chart-panel">
        <div className="chart-panel__head">
          <h2 className="section-title">{t('chart.title')}</h2>
          <ChartLegend />
        </div>
        <LiveChart history={history} />
      </section>
    </>
  );
}
