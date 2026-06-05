import { useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { metricHint, resolveProcessesState } from '../lib/metrics-view.js';

export function Processes({ metrics, online }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('cpu');
  const procs = metrics?.processes;
  const procState = resolveProcessesState(metrics, online);
  const list = sort === 'mem' ? procs?.topMemory ?? [] : procs?.topCpu ?? [];

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((p) => String(p.name).toLowerCase().includes(s));
  }, [list, q]);

  const titleCount = procState === 'ok' ? procs?.total ?? 0 : '—';

  return (
    <section className="panel">
      <h2 className="section-title">
        {t('processes.title')} ({titleCount})
      </h2>
      {procState !== 'ok' && (
        <p className="muted">{metricHint(procState, t)}</p>
      )}
      {procState === 'ok' && (
        <>
          <div className="toolbar">
            <input className="search-input" placeholder={t('processes.search')} value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="select-input" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="cpu">{t('processes.topCpu')}</option>
              <option value="mem">{t('processes.topRam')}</option>
            </select>
          </div>
          <table className="proc-table">
            <thead>
              <tr>
                <th>{t('processes.name')}</th>
                <th>{t('processes.pid')}</th>
                <th>{t('metrics.cpu')} %</th>
                <th>{t('metrics.ram')} %</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.pid}>
                  <td>{p.name}</td>
                  <td>{p.pid}</td>
                  <td>{p.cpu ?? '—'}</td>
                  <td>{p.memoryPercent ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
