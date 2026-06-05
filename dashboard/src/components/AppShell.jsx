import { NavLink } from 'react-router-dom';
import { AnimatedOutlet } from './AnimatedOutlet.jsx';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { LangToggle } from './LangToggle.jsx';
import { StatusBadge } from './StatusBadge.jsx';

const NAV = [
  ['/', 'nav.overview'],
  ['/hardware', 'nav.hardware'],
  ['/processes', 'nav.processes'],
  ['/storage', 'nav.storage'],
  ['/network', 'nav.network'],
  ['/history', 'nav.history'],
  ['/settings', 'nav.settings'],
  ['/remote-control', 'nav.remoteControl'],
];

export function AppShell({ hostname, online, status, wsConnected }) {
  const { t } = useI18n();

  return (
    <div className="app">
      <div className="app-ambient" aria-hidden="true">
        <div className="app-ambient__orb app-ambient__orb--1" />
        <div className="app-ambient__orb app-ambient__orb--2" />
        <div className="app-ambient__orb app-ambient__orb--3" />
      </div>
      <div className="app-scanlines" aria-hidden="true" />
      <div className="app-glow" aria-hidden="true" />
      <header className="header">
        <div>
          <p className="eyebrow">{t('header.eyebrow')}</p>
          <h1>{t('header.title')}</h1>
          <p className="subtitle">{hostname}</p>
        </div>
        <div className="header__right">
          <LangToggle />
          <StatusBadge status={status} online={online} />
          {!wsConnected && online && <span className="conn-hint">{t('header.poll')}</span>}
        </div>
      </header>
      <nav className="nav-tabs" aria-label={t('nav.sections')}>
        {NAV.map(([to, key]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-tab ${isActive ? 'is-active' : ''}`}>
            {t(key)}
          </NavLink>
        ))}
        <NavLink to="/monitor" className="nav-tab nav-tab--monitor">
          <span className="nav-tab__icon" aria-hidden="true">▣</span>
          {t('nav.monitorMode')}
        </NavLink>
      </nav>
      <AnimatedOutlet />
    </div>
  );
}
