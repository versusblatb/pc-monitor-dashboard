import { useI18n } from '../i18n/I18nProvider.jsx';

export function LangToggle() {
  const { lang, setLang, t } = useI18n();

  return (
    <button
      type="button"
      className="lang-toggle"
      onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
      aria-label={t('lang.switch')}
      title={t('lang.switch')}
    >
      <span className="lang-toggle__icon" aria-hidden="true">
        🌐
      </span>
      <span className="lang-toggle__label">{lang === 'ru' ? 'RU' : 'EN'}</span>
    </button>
  );
}
