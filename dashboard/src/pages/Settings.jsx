import { useEffect, useState } from 'react';
import { applyPerfMode, getPerfMode, setPerfMode } from '../adaptive.js';
import { THEMES, getTheme, setTheme, applyTheme } from '../themes/theme-engine.js';
import { LayoutEditor } from '../layout/LayoutEditor.jsx';
import { TelegramSettings } from '../components/TelegramSettings.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';

export function Settings() {
  const { t } = useI18n();
  const [mode, setMode] = useState(getPerfMode);
  const [theme, setThemeState] = useState(getTheme);

  useEffect(() => {
    applyPerfMode(mode);
    applyTheme(theme);
  }, [mode, theme]);

  return (
    <div className="settings-page">
      <section className="panel">
        <h2 className="section-title">{t('settings.perfTitle')}</h2>
        <div className="perf-modes">
          {[
            ['auto', t('settings.auto')],
            ['lite', t('settings.lite')],
            ['full', t('settings.full')],
          ].map(([m, l]) => (
            <button key={m} type="button" className={`perf-btn ${mode === m ? 'is-active' : ''}`} onClick={() => { setPerfMode(m); setMode(m); }}>
              {l}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 className="section-title">{t('settings.themeTitle')}</h2>
        <div className="perf-modes theme-grid">
          {Object.keys(THEMES).map((id) => (
            <button key={id} type="button" className={`perf-btn ${theme === id ? 'is-active' : ''}`} onClick={() => { setTheme(id); setThemeState(id); }}>
              {t(`themes.${id}`)}
            </button>
          ))}
        </div>
      </section>

      <TelegramSettings />

      <LayoutEditor />
    </div>
  );
}
