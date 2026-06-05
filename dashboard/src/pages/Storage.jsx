import { DiskCard } from '../components/MetricsUI.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

export function Storage({ metrics }) {
  const { t } = useI18n();
  const disks = metrics?.disks ?? [];

  return (
    <section className="panel">
      <h2 className="section-title">{t('storage.title')}</h2>
      {disks.length === 0 ? (
        <p className="muted">{t('storage.empty')}</p>
      ) : (
        <div className="disks-grid">{disks.map((d) => <DiskCard key={d.letter ?? d.mount} disk={d} />)}</div>
      )}
    </section>
  );
}
