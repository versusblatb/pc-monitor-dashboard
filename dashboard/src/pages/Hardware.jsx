import { useI18n } from '../i18n/I18nProvider.jsx';

export function Hardware({ metrics }) {
  const { t } = useI18n();
  const sys = metrics?.system ?? {};
  const cpu = metrics?.cpuInfo ?? {};
  const gpu = metrics?.gpuInfo ?? {};
  const mem = metrics?.memoryInfo ?? metrics?.memory ?? {};

  const rows = [
    [t('hardware.hostname'), metrics?.hostname],
    [t('hardware.manufacturer'), sys.manufacturer],
    [t('hardware.model'), sys.model],
    [t('hardware.os'), sys.os],
    [t('hardware.arch'), sys.arch],
    [t('hardware.bios'), sys.bios],
    [t('hardware.agent'), sys.agentVersion],
    [t('metrics.cpu'), cpu.model],
    [
      t('hardware.cores'),
      cpu.physicalCores != null
        ? t('hardware.coresFmt', { phys: cpu.physicalCores, log: cpu.logicalCores })
        : null,
    ],
    [t('hardware.frequency'), cpu.frequencyMhz != null ? `${cpu.frequencyMhz} MHz` : null],
    [t('metrics.gpu'), gpu.model ?? metrics?.gpuName],
    [t('hardware.vram'), gpu.memoryTotalMb != null ? `${gpu.memoryTotalMb} MB` : null],
    [t('metrics.ram'), mem.totalGb != null ? `${mem.totalGb} GB` : null],
    [t('hardware.uptime'), metrics?.uptime != null ? `${Math.floor(metrics.uptime / 3600)}h` : null],
  ];

  return (
    <section className="panel">
      <h2 className="section-title">{t('hardware.title')}</h2>
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
