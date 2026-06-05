import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { translations } from './translations.js';

const STORAGE_KEY = 'pc-monitor-lang';
const I18nContext = createContext(null);

function getNested(obj, path) {
  return path.split('.').reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

function interpolate(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

export function getLang() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'ru') return v;
  } catch {
    /* ignore */
  }
  return 'ru';
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(getLang);

  const setLang = useCallback((next) => {
    const l = next === 'en' ? 'en' : 'ru';
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
    setLangState(l);
  }, []);

  const dict = translations[lang];

  const t = useCallback(
    (key, vars) => {
      const val = getNested(dict, key);
      if (val == null) return key;
      return interpolate(val, vars);
    },
    [dict],
  );

  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';

  const value = useMemo(() => ({ lang, setLang, t, locale }), [lang, setLang, t, locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n requires I18nProvider');
  return ctx;
}
