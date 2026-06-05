import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiFetch, apiUrl } from '../api/client.js';

const CSRF_KEY = 'pcm_cmd_csrf';

export function getStoredCsrf() {
  try {
    return sessionStorage.getItem(CSRF_KEY) || '';
  } catch {
    return '';
  }
}

function storeCsrf(token) {
  try {
    if (token) sessionStorage.setItem(CSRF_KEY, token);
    else sessionStorage.removeItem(CSRF_KEY);
  } catch {
    /* ignore */
  }
}

export function useCommandSession() {
  const [active, setActive] = useState(false);
  const [expiresAt, setExpiresAt] = useState(null);
  const [commandsEnabled, setCommandsEnabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const csrfRef = useRef(getStoredCsrf());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.commandSessionStatus();
      setActive(Boolean(data.active));
      setExpiresAt(data.expiresAt ?? null);
      setCommandsEnabled(Boolean(data.enabled));
      setDisabledReason(data.reason ?? null);
      if (data.csrf) {
        csrfRef.current = data.csrf;
        storeCsrf(data.csrf);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'status failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  const login = useCallback(async (password) => {
    setError(null);
    const data = await api.commandSessionLogin(password);
    csrfRef.current = data.csrf;
    storeCsrf(data.csrf);
    setActive(true);
    setExpiresAt(data.expiresAt);
    await refresh();
    return data;
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.commandSessionLogout();
    csrfRef.current = '';
    storeCsrf('');
    setActive(false);
    setExpiresAt(null);
  }, []);

  const csrf = () => csrfRef.current || getStoredCsrf();

  return {
    active,
    expiresAt,
    commandsEnabled,
    disabledReason,
    loading,
    error,
    login,
    logout,
    refresh,
    csrf,
  };
}

export function commandFetch(path, opts = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getStoredCsrf(),
    ...(opts.headers || {}),
  };
  return apiFetch(path, {
    ...opts,
    credentials: 'include',
    headers,
  });
}

export function randomIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
