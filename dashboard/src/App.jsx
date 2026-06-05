import { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { applyPerfMode, getPerfMode } from './adaptive.js';
import { applyTheme, getTheme } from './themes/theme-engine.js';
import { useMetrics } from './hooks/useMetrics.js';
import { AppShell } from './components/AppShell.jsx';
import { Overview } from './pages/Overview.jsx';
import { Hardware } from './pages/Hardware.jsx';
import { Processes } from './pages/Processes.jsx';
import { Storage } from './pages/Storage.jsx';
import { Network } from './pages/Network.jsx';
import { HistoryPage } from './pages/HistoryPage.jsx';
import { Settings } from './pages/Settings.jsx';
import { RemoteControl } from './pages/RemoteControl.jsx';
import { useI18n } from './i18n/I18nProvider.jsx';
import './App.css';
import './themes/themes.css';
import './animations/premium-animations.css';

const CommandCenter = lazy(() =>
  import('./pages/CommandCenter.jsx').then((m) => ({ default: m.CommandCenter })),
);

function DashboardRoutes() {
  const { t } = useI18n();
  const ctx = useMetrics();
  const common = { metrics: ctx.metrics };

  return (
    <Routes>
      <Route element={<AppShell hostname={ctx.hostname} online={ctx.online} status={ctx.status} wsConnected={ctx.wsConnected} />}>
        <Route index element={<Overview {...ctx} />} />
        <Route path="hardware" element={<Hardware {...common} online={ctx.online} />} />
        <Route path="processes" element={<Processes {...common} online={ctx.online} />} />
        <Route path="storage" element={<Storage {...common} />} />
        <Route path="network" element={<Network {...common} online={ctx.online} />} />
        <Route path="settings" element={<Settings metrics={ctx.metrics} online={ctx.online} />} />
        <Route path="remote-control" element={<RemoteControl />} />
        <Route path="history" element={<HistoryPage />} />
      </Route>
      <Route
        path="monitor"
        element={
          <Suspense fallback={<p className="muted">{t('common.loading')}</p>}>
            <CommandCenter />
          </Suspense>
        }
      />
      <Route path="command-center" element={<Navigate to="/monitor" replace />} />
    </Routes>
  );
}

export default function App() {
  const [mode] = useState(getPerfMode);

  useEffect(() => {
    applyPerfMode(mode);
    applyTheme(getTheme());
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => applyPerfMode(getPerfMode());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  return (
    <BrowserRouter>
      <DashboardRoutes />
    </BrowserRouter>
  );
}
