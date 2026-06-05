import { useI18n } from '../i18n/I18nProvider.jsx';
import { formatFrequency } from '../lib/format-metrics.js';
import { formatMetricValue, resolveMetricState } from '../lib/metrics-view.js';

export function Hardware({ metrics, online }) {
  const { t } = useI18n();
  const sys = metrics?.system ?? {};
  const cpu = metrics?.cpuInfo ?? {};
  const gpu = metrics?.gpuInfo ?? {};
  const mem = metrics?.memoryInfo ?? {};
  const ctx = { online, metrics };

  const row = (label, value, opts = {}) => {
    const state = resolveMetricState(value, ctx, opts);
    return [label, formatMetricValue(value, state, t), state];
  };

  const rows = [
    row(t('hardware.hostname'), metrics?.hostname),
    row(t('hardware.manufacturer'), sys.manufacturer, { requireV2: true }),
    row(t('hardware.model'), sys.model, { requireV2: true }),
    row(t('hardware.os'), sys.os, { requireV2: true }),
    row(t('hardware.arch'), sys.arch, { requireV2: true }),
    row(t('hardware.bios'), sys.bios, { requireV2: true }),
    row(t('hardware.agent'), sys.agentVersion ?? metrics?.agentVersion),
    row(t('metrics.cpu'), cpu.model, { requireV2: true }),
    row(
      t('hardware.cores'),
      cpu.physicalCores != null
        ? t('hardware.coresFmt', { phys: cpu.physicalCores, log: cpu.logicalCores })
        : null,
      { requireV2: true, pendingIfOnline: true },
    ),
    row(
      t('hardware.frequency'),
      cpu.frequencyMhz != null ? formatFrequency(cpu.frequencyMhz) : null,
      { requireV2: true, pendingIfOnline: true },
    ),
    row(t('metrics.gpu'), gpu.model ?? metrics?.gpuName, { requireV2: true }),
    row(
      t('hardware.vram'),
      gpu.memoryTotalMb != null ? `${gpu.memoryTotalMb} MB` : null,
      { requireV2: true },
    ),
    row(t('metrics.ram'), mem.totalGb != null ? `${mem.totalGb} GB` : null),
    row(
      t('hardware.uptime'),
      metrics?.uptime != null ? `${Math.floor(metrics.uptime / 3600)}h` : null,
    ),
  ];

  return (
    <section className="panel">
      <h2 className="section-title">{t('hardware.title')}</h2>
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
