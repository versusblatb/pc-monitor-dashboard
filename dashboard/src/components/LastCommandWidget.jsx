import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadLastCommand } from '../lib/last-command.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

function statusClass(status) {
  if (status === 'succeeded') return 'status-pill--rc-ok';
  if (status === 'failed' || status === 'expired' || status === 'cancelled') return 'status-pill--rc-fail';
  if (status === 'running') return 'status-pill--rc-running';
  return 'status-pill--rc-pending';
}

export function LastCommandWidget() {
  const { t } = useI18n();
  const [last, setLast] = useState(() => loadLastCommand());

  useEffect(() => {
    const onUpdate = (e) => {
      const cmd = e.detail;
      if (cmd?.id) setLast(loadLastCommand());
    };
    const onCmd = (e) => {
      const cmd = e.detail;
      if (cmd?.id) setLast(loadLastCommand());
    };
    window.addEventListener('pcm-last-command', onUpdate);
    window.addEventListener('pcm-command-update', onCmd);
    return () => {
      window.removeEventListener('pcm-last-command', onUpdate);
      window.removeEventListener('pcm-command-update', onCmd);
    };
  }, []);

  if (!last) return null;

  const typeLabel = t(`remote.commands.${last.type}`, last.type);
  const statusKey = `remote.status.${last.status}`;
  const statusLabel = t(statusKey) !== statusKey ? t(statusKey) : last.status;
  const when = last.completedAt || last.createdAt;

  return (
    <section className="panel rc-last-widget">
      <div className="rc-last-widget__head">
        <h2 className="section-title">{t('remote.lastCommandTitle')}</h2>
        <Link className="btn btn--ghost" to="/remote-control">{t('remote.openPanel')}</Link>
      </div>
      <div className="rc-last-widget__body">
        <span className="rc-last-widget__type">{typeLabel}</span>
        <span className={`status-pill ${statusClass(last.status)}`}>{statusLabel}</span>
        {last.result?.pid != null && (
          <span className="rc-chip rc-chip--ok">
            {t('remote.appLaunched', { pid: last.result.pid })}
          </span>
        )}
        {last.errorCode && <span className="rc-chip rc-chip--danger">{last.errorCode}</span>}
      </div>
      {when && (
        <p className="muted rc-last-widget__time">
          {new Date(when).toLocaleString()}
        </p>
      )}
    </section>
  );
}
