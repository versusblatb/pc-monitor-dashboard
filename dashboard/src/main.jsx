import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { applyPerfMode } from './adaptive.js';
import { getLang, I18nProvider } from './i18n/I18nProvider.jsx';

applyPerfMode();
document.documentElement.lang = getLang();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
