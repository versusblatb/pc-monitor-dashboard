import { useCallback, useEffect, useState } from 'react';
import { api, getTelegramConfigKey, setTelegramConfigKey } from '../api/client.js';
import { useI18n } from '../i18n/I18nProvider.jsx';

export function TelegramSettings() {
  const { t } = useI18n();
  const [status, setStatus] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [chats, setChats] = useState([]);
  const [botInfo, setBotInfo] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);

  const refreshStatus = useCallback(() => {
    api.alertsStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const statusText = () => {
    if (!status) return t('settings.telegramUnknown');
    if (status.source === 'env') return t('settings.telegramEnvLocked');
    if (status.configured) return t('settings.telegramOn');
    if (status.enabled && (!status.tokenSet || !status.chatIdSet)) return t('settings.telegramIncomplete');
    return t('settings.telegramOff');
  };

  const run = async (key, fn) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  const verifyBot = () =>
    run('verify', async () => {
      const info = await api.verifyBotToken(botToken.trim());
      setBotInfo(info);
      setMsg({ ok: true, text: t('settings.telegramBotOk', { name: info.username ? `@${info.username}` : info.firstName }) });
    });

  const discoverChat = () =>
    run('discover', async () => {
      const res = await api.discoverTelegramChat(botToken.trim(), getTelegramConfigKey());
      setChats(res.chats);
      if (res.chats.length === 1) setChatId(res.chats[0].id);
      setMsg({ ok: true, text: t('settings.telegramChatFound', { count: res.chats.length }) });
    });

  const saveConfig = () =>
    run('save', async () => {
      const res = await api.saveAlertsConfig(
        { enabled, botToken: botToken.trim(), chatId: chatId.trim() },
        getTelegramConfigKey(),
      );
      if (res.configKey) setTelegramConfigKey(res.configKey);
      setStatus(res.status);
      setBotToken('');
      setMsg({ ok: true, text: t('settings.telegramSaved') });
    });

  const runTest = () =>
    run('test', async () => {
      const key = getTelegramConfigKey();
      if (!key && !status?.hasConfigKey) {
        throw new Error(t('settings.telegramSaveFirst'));
      }
      await api.testTelegram(key);
      setMsg({ ok: true, text: t('settings.telegramTestOk') });
    });

  const locked = status?.source === 'env' && !status?.uiConfigurable;
  const lostBrowserKey = status?.hasConfigKey && !getTelegramConfigKey();

  return (
    <section className="panel">
      <h2 className="section-title">{t('settings.telegramTitle')}</h2>
      <p className="muted">{t('settings.telegramHint')}</p>

      <dl className="info-grid">
        <div className="info-row">
          <dt>{t('status.label')}</dt>
          <dd>{statusText()}</dd>
        </div>
        {status?.chatIdMasked && (
          <div className="info-row">
            <dt>Chat ID</dt>
            <dd>{status.chatIdMasked}</dd>
          </div>
        )}
      </dl>

      {lostBrowserKey && <p className="muted">{t('settings.telegramKeyLost')}</p>}

      {locked ? (
        <p className="muted">{t('settings.telegramEnvNote')}</p>
      ) : (
        <>
          <ol className="setup-steps">
            <li>{t('settings.telegramStep1')}</li>
            <li>{t('settings.telegramStep2')}</li>
            <li>{t('settings.telegramStep3')}</li>
          </ol>

          <label className="telegram-field">
            <span className="telegram-field__label">{t('settings.telegramEnabled')}</span>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          </label>

          <label className="telegram-field">
            <span className="telegram-field__label">{t('settings.telegramToken')}</span>
            <input
              className="search-input telegram-field__input"
              type="password"
              placeholder={status?.tokenSet ? t('settings.telegramTokenKeep') : t('settings.telegramTokenPh')}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              autoComplete="off"
            />
          </label>

          <div className="toolbar">
            <button
              type="button"
              className="perf-btn"
              onClick={verifyBot}
              disabled={busy === 'verify' || !botToken.trim()}
            >
              {busy === 'verify' ? t('settings.telegramChecking') : t('settings.telegramVerifyBot')}
            </button>
            {botInfo?.botLink && (
              <a className="perf-btn telegram-link" href={botInfo.botLink} target="_blank" rel="noreferrer">
                {t('settings.telegramOpenBot', { name: `@${botInfo.username}` })}
              </a>
            )}
          </div>

          <div className="toolbar">
            <button
              type="button"
              className="perf-btn"
              onClick={discoverChat}
              disabled={busy === 'discover' || (!botToken.trim() && !status?.tokenSet)}
            >
              {busy === 'discover' ? t('settings.telegramSearching') : t('settings.telegramFindChat')}
            </button>
          </div>

          {chats.length > 1 && (
            <label className="telegram-field">
              <span className="telegram-field__label">{t('settings.telegramPickChat')}</span>
              <select className="select-input" value={chatId} onChange={(e) => setChatId(e.target.value)}>
                <option value="">{t('settings.telegramPickChatPh')}</option>
                {chats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="telegram-field">
            <span className="telegram-field__label">{t('settings.telegramChatId')}</span>
            <input
              className="search-input telegram-field__input"
              type="text"
              placeholder={status?.chatIdSet ? t('settings.telegramChatKeep') : t('settings.telegramChatPh')}
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              autoComplete="off"
            />
          </label>

          <div className="toolbar">
            <button type="button" className="perf-btn is-active" onClick={saveConfig} disabled={busy === 'save'}>
              {busy === 'save' ? t('settings.telegramSaving') : t('settings.telegramSave')}
            </button>
            {status?.testAvailable && (
              <button type="button" className="perf-btn" onClick={runTest} disabled={busy === 'test'}>
                {busy === 'test' ? t('settings.telegramTestSending') : t('settings.telegramTestBtn')}
              </button>
            )}
          </div>
        </>
      )}

      {msg && <p className={msg.ok ? 'test-ok' : 'test-err'}>{msg.text}</p>}
    </section>
  );
}
