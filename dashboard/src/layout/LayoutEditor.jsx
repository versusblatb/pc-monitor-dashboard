import { useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { CARD_REGISTRY, exportLayout, getLayout, importLayout, resetLayout, saveLayout } from './layout-store.js';

export function LayoutEditor() {
  const { t } = useI18n();
  const [profile, setProfile] = useState('desktop');
  const [layout, setLayout] = useState(() => getLayout('desktop'));
  const [importText, setImportText] = useState('');

  const refresh = (p = profile) => setLayout(getLayout(p));

  const toggleCard = (id) => {
    const cards = layout.cards.includes(id) ? layout.cards.filter((c) => c !== id) : [...layout.cards, id];
    const next = { ...layout, cards };
    saveLayout(profile, next);
    setLayout(next);
  };

  const move = (id, dir) => {
    const cards = [...layout.cards];
    const i = cards.indexOf(id);
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= cards.length) return;
    [cards[i], cards[j]] = [cards[j], cards[i]];
    const next = { ...layout, cards };
    saveLayout(profile, next);
    setLayout(next);
  };

  return (
    <section className="panel">
      <h2 className="section-title">{t('layout.title')}</h2>
      <select className="select-input" value={profile} onChange={(e) => { setProfile(e.target.value); refresh(e.target.value); }}>
        <option value="desktop">{t('layout.desktop')}</option>
        <option value="tablet">{t('layout.tablet')}</option>
        <option value="mobile">{t('layout.mobile')}</option>
        <option value="command-center">{t('layout.monitorMode')}</option>
      </select>
      <ul className="layout-list">
        {CARD_REGISTRY.map((c) => (
          <li key={c.id} className="layout-item">
            <label>
              <input type="checkbox" checked={layout.cards.includes(c.id)} onChange={() => toggleCard(c.id)} />{' '}
              {t(`layout.cards.${c.id}`)}
            </label>
            <span className="layout-actions">
              <button type="button" className="perf-btn" onClick={() => move(c.id, -1)} aria-label={t('layout.up')}>
                ↑
              </button>
              <button type="button" className="perf-btn" onClick={() => move(c.id, 1)} aria-label={t('layout.down')}>
                ↓
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="toolbar">
        <button type="button" className="perf-btn" onClick={() => { resetLayout(profile); refresh(); }}>
          {t('layout.reset')}
        </button>
        <button type="button" className="perf-btn" onClick={() => navigator.clipboard?.writeText(exportLayout(profile))}>
          {t('layout.export')}
        </button>
      </div>
      <textarea className="import-area" placeholder={t('layout.importPlaceholder')} value={importText} onChange={(e) => setImportText(e.target.value)} />
      <button
        type="button"
        className="perf-btn"
        onClick={() => {
          try {
            importLayout(profile, importText);
            refresh();
          } catch (e) {
            alert(e.message);
          }
        }}
      >
        {t('layout.import')}
      </button>
    </section>
  );
}
