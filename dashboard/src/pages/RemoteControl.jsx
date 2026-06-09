import { useCallback, useEffect, useRef, useState } from 'react';
import { commandApi, commandFetch } from '../api/command-client.js';
import { useMetrics } from '../hooks/useMetrics.js';
import {
  randomIdempotencyKey,
  resolveLoginErrorMessage,
  useCommandSession,
} from '../hooks/useCommandSession.js';
import { useI18n } from '../i18n/I18nProvider.jsx';
import './RemoteControl.css';

const DANGEROUS = new Set(['RESTART', 'SHUTDOWN', 'SCREENSHOT']);
const ACTIVE_STATUSES = new Set(['pending', 'sent', 'acknowledged', 'running']);

function statusLabel(status, t) {
  const key = `remote.status.${status}`;
  const label = t(key);
  return label !== key ? label : status;
}

function statusClass(status) {
  if (status === 'succeeded') return 'status-pill--rc-ok';
  if (status === 'failed' || status === 'expired' || status === 'cancelled') return 'status-pill--rc-fail';
  if (status === 'running') return 'status-pill--rc-running';
  return 'status-pill--rc-pending';
}

/** @param {unknown} err */
function resolveCommandError(err, t) {
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';
  const payload = err && typeof err === 'object' && 'payload' in err ? err.payload : null;
  const serverError = payload?.error;
  if (typeof serverError === 'string') return serverError;
  if (serverError && typeof serverError === 'object' && serverError.message) return String(serverError.message);
  if (code === 'AGENT_NOT_AUTHENTICATED') return t('remote.agentOfflineHint');
  return err instanceof Error ? err.message : t('remote.failed');
}

function ConfirmModal({ open, title, body, typedLabel, onConfirm, onCancel, dangerous }) {
  const { t } = useI18n();
  const [typed, setTyped] = useState('');
  const [countdown, setCountdown] = useState(dangerous ? 3 : 0);

  useEffect(() => {
    if (!open) {
      setTyped('');
      setCountdown(dangerous ? 3 : 0);
      return undefined;
    }
    if (!dangerous) return undefined;
    setCountdown(3);
    const id = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [open, dangerous]);

  if (!open) return null;

  const needsTyped = Boolean(typedLabel);
  const typedOk = !needsTyped || typed === typedLabel;
  const countdownOk = !dangerous || countdown === 0;

  return (
    <div className="rc-modal-backdrop" role="dialog" aria-modal="true">
      <div className="rc-modal">
        <h3>{title}</h3>
        <p>{body}</p>
        {needsTyped && (
          <label className="rc-modal__field">
            {t('remote.typeToConfirm', { word: typedLabel })}
            <input
              className="search-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}
        {dangerous && countdown > 0 && (
          <p className="muted">{t('remote.countdown', { sec: countdown })}</p>
        )}
        <div className="rc-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={!typedOk || !countdownOk}
            onClick={onConfirm}
          >
            {t('remote.confirmAction')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function RemoteControl() {
  const { t } = useI18n();
  const { online, hostname, lastSeen, metrics } = useMetrics();
  const {
    sessionState,
    commandsEnabled,
    transientError,
    login,
    logout,
    csrf,
  } = useCommandSession();
  const protectedLoadRef = useRef(0);
  const [password, setPassword] = useState('');
  const [loginState, setLoginState] = useState('idle');
  const [loginError, setLoginError] = useState('');
  const [caps, setCaps] = useState(null);
  const [apps, setApps] = useState([]);
  const [commands, setCommands] = useState([]);
  const [audit, setAudit] = useState([]);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [clearScan, setClearScan] = useState(null);
  const [msg, setMsg] = useState(null);
  const [msgKind, setMsgKind] = useState('info');
  const [screenshot, setScreenshot] = useState(null);
  const [appsEditable, setAppsEditable] = useState(false);
  const [draftApps, setDraftApps] = useState([]);
  const [newApp, setNewApp] = useState({ id: '', label: '', executable: '', allowStop: true });

  const agentVersion = caps?.agentVersion ?? metrics?.agentVersion ?? '—';
  const agentReady = Boolean(caps?.agentOnline);
  const isAuthenticated = sessionState === 'authenticated';
  const hasActiveCommands = commands.some((c) => ACTIVE_STATUSES.has(c.status));

  const clearProtectedData = useCallback(() => {
    setCaps(null);
    setApps([]);
    setCommands([]);
    setAudit([]);
    setClearScan(null);
  }, []);

  const loadProtectedData = useCallback(async () => {
    if (!isAuthenticated || !commandsEnabled) return;
    const token = csrf();
    const loadId = protectedLoadRef.current + 1;
    protectedLoadRef.current = loadId;
    const [c, a, list, log] = await Promise.all([
      commandFetch('/remote-control/capabilities', {
        headers: { 'X-CSRF-Token': token },
      }),
      commandFetch('/remote-control/apps', {
        headers: { 'X-CSRF-Token': token },
      }),
      commandFetch('/remote-control/commands', {
        headers: { 'X-CSRF-Token': token },
      }),
      commandFetch('/remote-control/audit', {
        headers: { 'X-CSRF-Token': token },
      }),
    ]);
    if (protectedLoadRef.current !== loadId) return;
    setCaps(c);
    setApps(a.apps ?? []);
    setAppsEditable(Boolean(a.editable));
    setDraftApps((a.apps ?? []).map((app) => ({ ...app, executable: app.executable || '' })));
    setCommands(list.commands ?? []);
    setAudit(log.audit ?? []);
  }, [isAuthenticated, commandsEnabled, csrf]);

  useEffect(() => {
    if (!isAuthenticated) {
      protectedLoadRef.current += 1;
      clearProtectedData();
      return;
    }
    loadProtectedData().catch(() => {
      /* protected fetch errors handled silently; session poll will recover */
    });
  }, [isAuthenticated, loadProtectedData, clearProtectedData]);

  useEffect(() => {
    const onUpdate = (e) => {
      const cmd = e.detail;
      if (!cmd?.id || !isAuthenticated) return;
      setCommands((prev) => {
        const idx = prev.findIndex((c) => c.id === cmd.id);
        if (idx < 0) return [cmd, ...prev].slice(0, 50);
        const next = [...prev];
        next[idx] = cmd;
        return next;
      });
    };
    window.addEventListener('pcm-command-update', onUpdate);
    return () => window.removeEventListener('pcm-command-update', onUpdate);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !hasActiveCommands) return undefined;
    const id = setInterval(() => {
      loadProtectedData().catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [isAuthenticated, hasActiveCommands, loadProtectedData]);

  const applyCommandResult = (command) => {
    if (!command) return;
    if (command.type === 'SCREENSHOT' && command.status === 'succeeded' && command.result?.imageBase64) {
      setScreenshot({
        mimeType: command.result.mimeType || 'image/jpeg',
        data: command.result.imageBase64,
      });
      setMsgKind('ok');
      setMsg(t('remote.screenshotTelegram'));
    }
    if (command.status === 'succeeded') {
      setMsgKind('ok');
      setMsg(t('remote.commandSucceeded'));
    } else if (command.status === 'failed') {
      setMsgKind('error');
      setMsg(command.errorCode || t('remote.commandFailed'));
    } else {
      setMsgKind('info');
      setMsg(t('remote.commandQueued'));
    }
  };

  const sendCommand = async (type, params = {}, confirmation) => {
    if (!agentReady) {
      setMsgKind('error');
      setMsg(t('remote.agentOfflineHint'));
      return;
    }

    setBusy(true);
    setMsg(null);
    try {
      const body = {
        deviceId: caps?.deviceId,
        type,
        params,
        confirmation,
        idempotencyKey: randomIdempotencyKey(),
      };
      const res = await commandApi.createCommand(body, csrf());
      if (res.command) {
        setCommands((prev) => [res.command, ...prev.filter((c) => c.id !== res.command.id)].slice(0, 50));
        applyCommandResult(res.command);
      } else {
        setMsgKind('info');
        setMsg(t('remote.commandQueued'));
      }
      await loadProtectedData();
    } catch (e) {
      setMsgKind('error');
      setMsg(resolveCommandError(e, t));
    } finally {
      setBusy(false);
      setModal(null);
    }
  };

  const saveAppsList = async () => {
    setBusy(true);
    try {
      const payload = draftApps.map((a) => ({
        id: a.id,
        label: a.label || a.id,
        executable: a.executable,
        args: [],
        allowStop: Boolean(a.allowStop),
      }));
      const res = await commandApi.saveApps(payload, csrf());
      if (!res.synced) {
        setMsgKind('error');
        setMsg(t('remote.appsSyncFailed'));
      } else {
        setMsgKind('ok');
        setMsg(t('remote.appsSaved'));
      }
      await loadProtectedData();
    } catch (e) {
      setMsgKind('error');
      setMsg(resolveCommandError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const addDraftApp = () => {
    const id = newApp.id.trim().toLowerCase();
    if (!id || !newApp.executable.trim()) return;
    setDraftApps((prev) => [...prev, {
      id,
      label: newApp.label.trim() || id,
      executable: newApp.executable.trim(),
      allowStop: newApp.allowStop,
    }]);
    setNewApp({ id: '', label: '', executable: '', allowStop: true });
  };

  const openScreenshotPreview = async (command) => {
    if (command.result?.imageBase64) {
      setScreenshot({
        mimeType: command.result.mimeType || 'image/jpeg',
        data: command.result.imageBase64,
      });
      return;
    }
    if (!command.result?.hasPreview) return;
    setBusy(true);
    try {
      const res = await commandApi.getCommand(command.id, csrf());
      const img = res.command?.result?.imageBase64;
      if (img) {
        setScreenshot({
          mimeType: res.command.result.mimeType || 'image/jpeg',
          data: img,
        });
      }
    } catch (e) {
      setMsgKind('error');
      setMsg(resolveCommandError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const cancelCommand = async (id) => {
    setBusy(true);
    try {
      await commandApi.cancelCommand(id, csrf());
      await loadProtectedData();
    } catch (e) {
      setMsgKind('error');
      setMsg(resolveCommandError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const openConfirm = (type, params = {}) => {
    setModal({ type, params });
  };

  const cap = (key) => caps?.capabilities?.[key] === true;
  const disabledGlobal = !commandsEnabled;
  const disabledOffline = !agentReady;

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (!password || loginState === 'submitting') return;

    setLoginError('');
    setLoginState('submitting');

    try {
      await login(password);
      setPassword('');
      setLoginState('success');
    } catch (err) {
      setLoginState('error');
      setLoginError(resolveLoginErrorMessage(err, t));
    }
  };

  if (sessionState === 'initializing') {
    return <p className="muted">{t('common.loading')}</p>;
  }

  if (disabledGlobal) {
    return (
      <section className="panel">
        <h2 className="section-title">{t('remote.title')}</h2>
        <p className="rc-disabled">{t('remote.disabledByAdmin')}</p>
      </section>
    );
  }

  if (!isAuthenticated) {
    return (
      <section className="panel rc-login">
        <h2 className="section-title">{t('remote.loginTitle')}</h2>
        <p className="muted">{t('remote.loginHint')}</p>
        {transientError && sessionState === 'error' && (
          <p className="rc-banner rc-banner--warn">{t('remote.errors.serverUnavailable')}</p>
        )}
        <form onSubmit={handleLoginSubmit} noValidate>
          <input
            className="search-input"
            type="password"
            name="command-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('remote.password')}
            autoComplete="current-password"
            disabled={loginState === 'submitting'}
          />
          <div role="alert" aria-live="polite" className="rc-msg rc-msg--error">
            {loginError}
          </div>
          <button
            type="submit"
            className="btn"
            disabled={!password || loginState === 'submitting'}
          >
            {loginState === 'submitting' ? t('remote.checking') : t('remote.login')}
          </button>
        </form>
      </section>
    );
  }

  const modalTitle = modal ? t(`remote.commands.${modal.type}`, modal.type) : '';

  return (
    <div className="rc-page">
      <ConfirmModal
        open={Boolean(modal)}
        title={modalTitle}
        body={modal ? t(`remote.effects.${modal.type}`, t('remote.confirmBody')) : ''}
        typedLabel={modal && DANGEROUS.has(modal.type) ? modal.type : null}
        dangerous={modal && DANGEROUS.has(modal.type)}
        onCancel={() => setModal(null)}
        onConfirm={() => modal && sendCommand(modal.type, modal.params, DANGEROUS.has(modal.type) ? modal.type : undefined)}
      />

      {transientError && (
        <p className="rc-banner rc-banner--warn">{transientError}</p>
      )}

      {caps?.capabilities?.executionMode === 'mock' && (
        <p className="rc-banner rc-banner--warn">{t('remote.mockMode')}</p>
      )}

      {agentReady ? (
        <p className="rc-banner rc-banner--ok">{t('remote.agentReady')}</p>
      ) : (
        <p className="rc-banner rc-banner--warn">{online ? t('remote.agentUnstable') : t('remote.agentOfflineHint')}</p>
      )}

      <section className="panel">
        <div className="rc-head">
          <h2 className="section-title">{t('remote.title')}</h2>
          <div className="rc-row-actions">
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => loadProtectedData()}>
              {t('remote.refresh')}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={async () => {
                await logout();
                clearProtectedData();
                setLoginState('idle');
                setLoginError('');
              }}
            >
              {t('remote.logout')}
            </button>
          </div>
        </div>
        <div className="rc-status-strip">
          <span className={`rc-chip ${agentReady ? 'rc-chip--ok' : 'rc-chip--warn'}`}>
            {agentReady ? t('remote.agentReady') : t('remote.agentOfflineHint')}
          </span>
          {caps?.capabilities?.executionMode && (
            <span className="rc-chip">{`mode: ${caps.capabilities.executionMode}`}</span>
          )}
          {!cap('screenshot') && (
            <span className="rc-chip rc-chip--warn">{t('remote.screenshotDisabled')}</span>
          )}
        </div>
        {msg && <p className={`rc-msg ${msgKind === 'ok' ? 'rc-msg--ok' : msgKind === 'error' ? 'rc-msg--error' : ''}`}>{msg}</p>}
        {hasActiveCommands && <p className="muted">{t('remote.pendingHint')}</p>}
        <dl className="info-grid rc-status">
          <div className="info-row"><dt>{t('remote.device')}</dt><dd>{hostname}</dd></div>
          <div className="info-row"><dt>{t('remote.online')}</dt><dd>{agentReady ? t('conn.connected') : (online ? t('remote.agentUnstable') : t('agent.offline'))}</dd></div>
          <div className="info-row"><dt>{t('remote.agentVersion')}</dt><dd>{agentVersion}</dd></div>
          <div className="info-row"><dt>{t('lastSeen')}</dt><dd>{lastSeen ? new Date(lastSeen).toLocaleString() : '—'}</dd></div>
        </dl>
      </section>

      <section className="panel">
        <h3 className="section-title">{t('remote.quickActions')}</h3>
        <div className="rc-actions">
          <button type="button" className="btn rc-btn" disabled={disabledOffline || !cap('lock') || busy} onClick={() => openConfirm('LOCK')}>Lock</button>
          <button type="button" className="btn rc-btn" disabled={disabledOffline || !cap('sleep') || busy} onClick={() => openConfirm('SLEEP')}>Sleep</button>
          <button type="button" className="btn rc-btn" disabled={disabledOffline || !cap('hibernate') || busy} onClick={() => openConfirm('HIBERNATE')}>Hibernate</button>
        </div>
      </section>

      <section className="panel">
        <h3 className="section-title">{t('remote.power')}</h3>
        <div className="rc-actions">
          <button type="button" className="btn btn--danger rc-btn" disabled={disabledOffline || !cap('restart') || busy} onClick={() => openConfirm('RESTART')}>Restart</button>
          <button type="button" className="btn btn--danger rc-btn" disabled={disabledOffline || !cap('shutdown') || busy} onClick={() => openConfirm('SHUTDOWN')}>Shutdown</button>
        </div>
      </section>

      <section className="panel">
        <h3 className="section-title">{t('remote.apps')}</h3>
        <div className="rc-apps">
          {apps.map((app) => (
            <div key={app.id} className="rc-app-row">
              <span>{app.label}</span>
              <button type="button" className="btn rc-btn" disabled={disabledOffline || !cap('launchApp') || busy} onClick={() => sendCommand('LAUNCH_APP', { appId: app.id })}>{t('remote.launch')}</button>
              {app.allowStop && (
                <button type="button" className="btn btn--ghost rc-btn" disabled={disabledOffline || !cap('stopApp') || busy} onClick={() => openConfirm('STOP_APP', { appId: app.id })}>{t('remote.stop')}</button>
              )}
            </div>
          ))}
          {!apps.length && <p className="muted">{t('remote.noApps')}</p>}
        </div>
      </section>

      <section className="panel">
        <h3 className="section-title">{t('remote.appsManage')}</h3>
        <p className="muted">{t('remote.appsHint')}</p>
        <div className="rc-apps-editor">
          {draftApps.map((app, idx) => (
            <div key={`${app.id}-${idx}`} className="rc-app-editor-row">
              <input className="search-input" value={app.id} readOnly />
              <input className="search-input" value={app.label} onChange={(e) => {
                const next = [...draftApps];
                next[idx] = { ...app, label: e.target.value };
                setDraftApps(next);
              }} />
              <input className="search-input" value={app.executable || ''} onChange={(e) => {
                const next = [...draftApps];
                next[idx] = { ...app, executable: e.target.value };
                setDraftApps(next);
              }} />
              <label className="rc-check">
                <input type="checkbox" checked={Boolean(app.allowStop)} onChange={(e) => {
                  const next = [...draftApps];
                  next[idx] = { ...app, allowStop: e.target.checked };
                  setDraftApps(next);
                }} />
                {t('remote.appAllowStop')}
              </label>
              <button type="button" className="btn btn--ghost" onClick={() => setDraftApps((prev) => prev.filter((_, i) => i !== idx))}>{t('remote.removeApp')}</button>
            </div>
          ))}
          <div className="rc-app-editor-row">
            <input className="search-input" placeholder={t('remote.appId')} value={newApp.id} onChange={(e) => setNewApp((s) => ({ ...s, id: e.target.value }))} />
            <input className="search-input" placeholder={t('remote.appLabel')} value={newApp.label} onChange={(e) => setNewApp((s) => ({ ...s, label: e.target.value }))} />
            <input className="search-input" placeholder={t('remote.appPath')} value={newApp.executable} onChange={(e) => setNewApp((s) => ({ ...s, executable: e.target.value }))} />
            <button type="button" className="btn btn--ghost" onClick={addDraftApp}>{t('remote.addApp')}</button>
          </div>
          <button type="button" className="btn" disabled={!appsEditable || busy || !draftApps.length} onClick={saveAppsList}>
            {t('remote.saveApps')}
          </button>
        </div>
      </section>

      <section className="panel">
        <h3 className="section-title">{t('remote.maintenance')}</h3>
        <div className="rc-actions">
          <button
            type="button"
            className="btn rc-btn"
            disabled={disabledOffline || !cap('clearTemp') || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await commandFetch('/remote-control/commands', {
                  method: 'POST',
                  headers: { 'X-CSRF-Token': csrf() },
                  body: JSON.stringify({
                    deviceId: caps?.deviceId,
                    type: 'CLEAR_TEMP',
                    params: { phase: 'scan' },
                    idempotencyKey: randomIdempotencyKey(),
                  }),
                });
                setClearScan(res.command?.result);
              } catch (e) {
                setMsg(e instanceof Error ? e.message : t('remote.failed'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('remote.scanTemp')}
          </button>
          {clearScan && (
            <p className="muted">
              {t('remote.scanResult', { files: clearScan.files ?? 0, bytes: clearScan.bytes ?? 0 })}
            </p>
          )}
          <button
            type="button"
            className="btn btn--danger rc-btn"
            disabled={disabledOffline || !cap('clearTemp') || !clearScan || busy}
            onClick={() => openConfirm('CLEAR_TEMP', { phase: 'confirm' })}
          >
            {t('remote.confirmCleanup')}
          </button>
        </div>
      </section>

      <section className="panel">
        <h3 className="section-title">{t('remote.privacy')}</h3>
        <p className="muted">{t('remote.screenshotWarning')}</p>
        <button
          type="button"
          className="btn btn--danger rc-btn"
          disabled={disabledOffline || !cap('screenshot') || busy}
          onClick={() => openConfirm('SCREENSHOT')}
        >
          Screenshot
        </button>
      </section>

      <section className="panel">
        <h3 className="section-title">{t('remote.recentCommands')}</h3>
        <div className="rc-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('remote.colTime')}</th>
                <th>{t('remote.colCommand')}</th>
                <th>{t('remote.colStatus')}</th>
                <th>{t('remote.colError')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {commands.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.createdAt).toLocaleString()}</td>
                  <td>{c.type}</td>
                  <td><span className={`status-pill ${statusClass(c.status)}`}>{statusLabel(c.status, t)}</span></td>
                  <td>{c.errorCode ?? '—'}</td>
                  <td>
                    {['pending', 'sent'].includes(c.status) && (
                      <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => cancelCommand(c.id)}>
                        {t('remote.cancel')}
                      </button>
                    )}
                    {c.type === 'SCREENSHOT' && c.status === 'succeeded' && (c.result?.imageBase64 || c.result?.hasPreview) && (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => openScreenshotPreview(c)}
                      >
                        {t('remote.screenshotPreview')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3 className="section-title">{t('remote.audit')}</h3>
        <ul className="rc-audit">
          {audit.slice(0, 20).map((e) => (
            <li key={e.id}>
              <span>{new Date(e.timestamp).toLocaleString()}</span>
              <span>{e.eventType}</span>
            </li>
          ))}
        </ul>
      </section>

      {screenshot && (
        <div className="rc-modal-backdrop" role="dialog" aria-modal="true">
          <div className="rc-modal rc-shot-modal">
            <h3>{t('remote.screenshotPreview')}</h3>
            <img src={`data:${screenshot.mimeType};base64,${screenshot.data}`} alt={t('remote.screenshotPreview')} />
            <div className="rc-modal__actions">
              <button type="button" className="btn" onClick={() => setScreenshot(null)}>{t('remote.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
