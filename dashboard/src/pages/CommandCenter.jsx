import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMetrics } from '../hooks/useMetrics.js';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { MetricBar } from '../components/MetricsUI.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import '../command-center.css';

function Clock() {
  const { locale } = useI18n();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="cc-clock">
      <div className="cc-clock__time">{now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
      <div className="cc-clock__date">{now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
    </div>
  );
}

export function CommandCenter() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { online, metrics, status, hostname, lastSeen } = useMetrics();
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const tier = document.documentElement.dataset.perfTier;
    if (tier === 'lite') return;
    const id = setInterval(() => setShift((s) => (s + 1) % 4), 120_000);
    return () => clearInterval(id);
  }, []);

  const exitMonitor = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    navigate('/');
  };

  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const disk = metrics?.disks?.find((d) => String(d.letter ?? '').startsWith('C')) ?? metrics?.disks?.[0];
  const cpuTemp = metrics?.cpuInfo?.temperature;
  const gpuTemp = metrics?.gpuInfo?.temperature;

  return (
    <div className={`command-center shift-${shift}`}>
      <button type="button" className="cc-exit" onClick={exitMonitor} aria-label={t('monitorMode.exit')}>
        <span className="cc-exit__arrow" aria-hidden="true">←</span>
        <span className="cc-exit__label">{t('monitorMode.exit')}</span>
      </button>

      <header className="cc-header">
        <Clock />
        <div className="cc-host">
          <h1>{hostname}</h1>
          <p className="cc-mode-label">{t('monitorMode.title')}</p>
          <StatusBadge status={status} online={online} />
        </div>
        <button type="button" className="perf-btn" onClick={toggleFs}>
          {t('monitorMode.fullscreen')}
        </button>
      </header>

      <div className="cc-grid">
        <div className="cc-metric"><span className="cc-label">{t('metrics.cpu')}</span><span className="cc-value">{metrics?.cpu ?? '—'}%</span><MetricBar value={metrics?.cpu} color="#00e5ff" label={t('metrics.cpu')} /></div>
        <div className="cc-metric"><span className="cc-label">{t('metrics.gpu')}</span><span className="cc-value">{metrics?.gpu ?? '—'}%</span><MetricBar value={metrics?.gpu} color="#ffb020" label={t('metrics.gpu')} /></div>
        <div className="cc-metric"><span className="cc-label">{t('metrics.ram')}</span><span className="cc-value">{metrics?.ram ?? '—'}%</span><MetricBar value={metrics?.ram} color="#7a5cff" label={t('metrics.ram')} /></div>
        <div className="cc-metric"><span className="cc-label">{t('metrics.cpu')} °C</span><span className="cc-value">{cpuTemp ?? '—'}</span></div>
        <div className="cc-metric"><span className="cc-label">{t('metrics.gpu')} °C</span><span className="cc-value">{gpuTemp ?? '—'}</span></div>
        <div className="cc-metric"><span className="cc-label">{t('monitorMode.diskC')}</span><span className="cc-value">{disk?.usedPct ?? disk?.usedPercent ?? '—'}%</span></div>
        <div className="cc-metric"><span className="cc-label">{t('monitorMode.netDown')}</span><span className="cc-value cc-small">{formatBps(metrics?.network?.downloadBps)}</span></div>
        <div className="cc-metric"><span className="cc-label">{t('monitorMode.netUp')}</span><span className="cc-value cc-small">{formatBps(metrics?.network?.uploadBps)}</span></div>
      </div>

      <footer className="cc-footer">
        <span>
          {t('monitorMode.uptime')}: {metrics?.uptime != null ? `${Math.floor(metrics.uptime / 3600)}h` : '—'}
        </span>
        {lastSeen && (
          <span>
            {t('monitorMode.lastSeen')}: {new Date(lastSeen).toLocaleTimeString(locale)}
          </span>
        )}
      </footer>
    </div>
  );
}

function formatBps(v) {
  if (v == null) return '—';
  if (v < 1024 ** 2) return `${(v / 1024).toFixed(0)} KB/s`;
  return `${(v / 1024 ** 2).toFixed(1)} MB/s`;
}
