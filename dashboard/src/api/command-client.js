/** Same-origin proxy only — never metrics API base or absolute backend URLs. */
export const COMMAND_API_BASE = '/backend-api';

if (
  import.meta.env?.PROD &&
  /^https?:\/\//i.test(COMMAND_API_BASE)
) {
  throw new Error(
    'Remote Control API must use the same-origin /backend-api proxy',
  );
}

/**
 * @param {string} path Must start with /, e.g. `/command-session/status`
 */
export function resolveCommandUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = `${COMMAND_API_BASE}${normalized}`;

  const legacyApiPrefix = `/api/${'command'}`;
  if (
    url.includes('onrender.com') ||
    /^https?:\/\//i.test(url) ||
    url.includes(`${legacyApiPrefix}-session`) ||
    url.includes(`${legacyApiPrefix.replace('command', 'remote')}-control`)
  ) {
    throw new Error('Remote Control must use same-origin /backend-api proxy');
  }

  return url;
}

/**
 * @param {string} path
 * @param {RequestInit} [options]
 */
export async function commandFetch(path, options = {}) {
  const response = await fetch(resolveCommandUrl(path), {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(
      data?.error?.message ||
      data?.message ||
      `HTTP ${response.status}`,
    );

    // @ts-expect-error enrich
    error.status = response.status;
    // @ts-expect-error enrich
    error.code = data?.error?.code || data?.code || 'REQUEST_FAILED';
    // @ts-expect-error enrich
    error.payload = data;

    throw error;
  }

  return data;
}

export const commandApi = {
  sessionStatus: () => commandFetch('/command-session/status'),
  sessionLogin: (password) =>
    commandFetch('/command-session/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  sessionLogout: () =>
    commandFetch('/command-session/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  capabilities: (csrf) =>
    commandFetch('/remote-control/capabilities', {
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    }),
  apps: (csrf) =>
    commandFetch('/remote-control/apps', {
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    }),
  saveApps: (apps, csrf) =>
    commandFetch('/remote-control/apps', {
      method: 'PUT',
      headers: { 'X-CSRF-Token': csrf },
      body: JSON.stringify({ apps }),
    }),
  commands: (csrf) =>
    commandFetch('/remote-control/commands', {
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    }),
  audit: (csrf) =>
    commandFetch('/remote-control/audit', {
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    }),
  createCommand: (body, csrf) =>
    commandFetch('/remote-control/commands', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrf },
      body: JSON.stringify(body),
    }),
  cancelCommand: (id, csrf) =>
    commandFetch(`/remote-control/commands/${id}/cancel`, {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrf },
      body: JSON.stringify({}),
    }),
  getCommand: (id, csrf) =>
    commandFetch(`/remote-control/commands/${id}`, {
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    }),
  /** @param {string} csrf */
  downloadAuditCsv: async (csrf) => {
    const res = await fetch(resolveCommandUrl('/remote-control/audit?format=csv'), {
      credentials: 'include',
      headers: {
        Accept: 'text/csv',
        'X-CSRF-Token': csrf,
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.blob();
  },
};
