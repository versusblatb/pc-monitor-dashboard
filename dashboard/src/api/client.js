const API_BASE = import.meta.env.VITE_API_URL || '';
const TELEGRAM_KEY_STORAGE = 'pc-monitor-telegram-key';

export function getTelegramConfigKey() {
  try {
    return localStorage.getItem(TELEGRAM_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setTelegramConfigKey(key) {
  try {
    localStorage.setItem(TELEGRAM_KEY_STORAGE, key);
  } catch {
    /* ignore */
  }
}

function configHeaders(configKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (configKey) headers['X-Config-Key'] = configKey;
  return headers;
}

export function apiUrl(path) {
  if (!API_BASE) return path;
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}

export async function apiFetch(path, opts = {}) {
  const res = await fetch(apiUrl(path), opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  metrics: () => apiFetch('/api/metrics'),
  status: () => apiFetch('/api/status'),
  health: () => apiFetch('/api/health'),
  system: () => apiFetch('/api/system'),
  processes: () => apiFetch('/api/processes'),
  disks: () => apiFetch('/api/disks'),
  network: () => apiFetch('/api/network'),
  history: (range = '1h') => apiFetch(`/api/history?range=${range}`),
  alertsStatus: () => apiFetch('/api/alerts/status'),
  saveAlertsConfig: (body, configKey) =>
    apiFetch('/api/alerts/config', {
      method: 'POST',
      headers: configHeaders(configKey),
      body: JSON.stringify(body),
    }),
  verifyBotToken: (botToken) =>
    apiFetch('/api/alerts/bot-info', {
      method: 'POST',
      headers: configHeaders(),
      body: JSON.stringify({ botToken }),
    }),
  discoverTelegramChat: (botToken, configKey) =>
    apiFetch('/api/alerts/discover-chat', {
      method: 'POST',
      headers: configHeaders(configKey),
      body: JSON.stringify({ botToken }),
    }),
  testTelegram: (configKey) =>
    apiFetch('/api/alerts/test', {
      method: 'POST',
      headers: configHeaders(configKey),
    }),
};
