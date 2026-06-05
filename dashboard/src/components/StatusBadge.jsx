import { useI18n } from '../i18n/I18nProvider.jsx';

const STATUS_KEYS = [
  'offline',
  'online',
  'idle',
  'gaming',
  'high-load',
  'overheating',
  'low-memory',
  'low-disk-space',
  'network-issue',
];

export function StatusBadge({ status, online }) {
  const { t } = useI18n();
  let label = t('status.offline');
  if (online) {
    label = STATUS_KEYS.includes(status) ? t(`status.${status}`) : t('status.online');
  }
  const cls = !online ? 'status-pill--offline' : status === 'overheating' ? 'status-pill--danger' : 'status-pill--online';

  return (
    <div className={`status-pill ${cls}`} role="status">
      <span className="status-dot" />
      {label}
    </div>
  );
}
