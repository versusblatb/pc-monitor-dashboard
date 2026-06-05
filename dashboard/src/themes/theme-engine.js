const STORAGE_KEY = 'pc-monitor-theme';

export const THEMES = {
  cyberpunk: { label: 'Cyberpunk', class: 'theme-cyberpunk' },
  minimal: { label: 'Minimal Dark', class: 'theme-minimal' },
  oled: { label: 'OLED Black', class: 'theme-oled' },
  terminal: { label: 'Terminal Green', class: 'theme-terminal' },
  ice: { label: 'Ice Blue', class: 'theme-ice' },
  rgb: { label: 'RGB Gaming', class: 'theme-rgb' },
};

export function getTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'cyberpunk';
}

export function setTheme(id) {
  localStorage.setItem(STORAGE_KEY, id);
  applyTheme(id);
}

export function applyTheme(id) {
  const root = document.documentElement;
  Object.values(THEMES).forEach((t) => root.classList.remove(t.class));
  const theme = THEMES[id] || THEMES.cyberpunk;
  root.classList.add(theme.class);
  root.dataset.theme = id;
}
