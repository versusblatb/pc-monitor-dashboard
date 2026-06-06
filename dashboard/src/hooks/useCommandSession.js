import { useCallback, useEffect, useRef, useState } from 'react';
import { commandApi, commandFetch } from '../api/command-client.js';

/** @typedef {'initializing'|'anonymous'|'submitting'|'authenticated'|'error'} SessionState */

const STATUS_POLL_MS = 60_000;

/**
 * @param {unknown} err
 */
export function resolveLoginErrorMessage(err, t) {
  const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 0;
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : '';

  if (code === 'INVALID_CREDENTIALS' || status === 401) {
    return t('remote.errors.invalidCredentials');
  }
  if (code === 'TOO_MANY_ATTEMPTS' || status === 429) {
    return t('remote.errors.tooManyAttempts');
  }
  if (code === 'COMMANDS_DISABLED' || status === 503) {
    return t('remote.errors.commandsDisabled');
  }
  if (status === 403) {
    return t('remote.errors.securityRejected');
  }
  if (status === 502 || status === 503 || status === 504) {
    return t('remote.errors.serverUnavailable');
  }
  if (code === 'SESSION_NOT_SAVED') {
    return t('remote.errors.sessionNotSaved');
  }
  if (err instanceof TypeError || status === 0) {
    return t('remote.errors.network');
  }
  return t('remote.loginFailed');
}

export function useCommandSession() {
  /** @type {[SessionState, Function]} */
  const [sessionState, setSessionState] = useState('initializing');
  const [expiresAt, setExpiresAt] = useState(null);
  const [commandsEnabled, setCommandsEnabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState(null);
  const [transientError, setTransientError] = useState('');
  const csrfRef = useRef('');
  const initDoneRef = useRef(false);
  const sessionStateRef = useRef(sessionState);

  useEffect(() => {
    sessionStateRef.current = sessionState;
  }, [sessionState]);

  const applyStatus = useCallback((data, { background = false } = {}) => {
    const authenticated = Boolean(data.authenticated ?? data.active);
    setExpiresAt(data.expiresAt ?? null);
    setCommandsEnabled(Boolean(data.enabled));
    setDisabledReason(data.reason ?? null);
    if (data.csrf) csrfRef.current = data.csrf;

    if (authenticated) {
      setSessionState('authenticated');
      setTransientError('');
      return true;
    }

    if (!background && sessionStateRef.current !== 'submitting') {
      setSessionState('anonymous');
    } else if (background && sessionStateRef.current === 'authenticated') {
      setSessionState('anonymous');
    }
    return false;
  }, []);

  const fetchStatus = useCallback(async ({ background = false } = {}) => {
    try {
      const data = await commandApi.sessionStatus();
      return applyStatus(data, { background });
    } catch (e) {
      const status = e && typeof e === 'object' && 'status' in e ? Number(e.status) : 0;
      if (background && sessionStateRef.current === 'authenticated') {
        setTransientError('status refresh failed');
        return true;
      }
      if (!background) {
        if (status === 401) setSessionState('anonymous');
        else setSessionState('error');
      }
      return false;
    }
  }, [applyStatus]);

  useEffect(() => {
    if (initDoneRef.current) return undefined;
    initDoneRef.current = true;

    let alive = true;

    (async () => {
      await fetchStatus({ background: false });
      if (alive && sessionStateRef.current === 'initializing') {
        setSessionState('anonymous');
      }
    })().catch(() => {
      if (alive) setSessionState('anonymous');
    });

    const id = setInterval(() => {
      if (sessionStateRef.current === 'authenticated') {
        fetchStatus({ background: true });
      }
    }, STATUS_POLL_MS);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fetchStatus]);

  const login = useCallback(async (password) => {
    setSessionState('submitting');
    let data;
    try {
      data = await commandApi.sessionLogin(password);
    } catch (e) {
      setSessionState('anonymous');
      throw e;
    }

    if (!data?.ok) {
      const err = new Error('login failed');
      // @ts-expect-error enrich
      err.code = data?.error?.code || 'INVALID_CREDENTIALS';
      // @ts-expect-error enrich
      err.status = 401;
      setSessionState('anonymous');
      throw err;
    }

    if (data.csrf) csrfRef.current = data.csrf;

    const authenticated = await fetchStatus({ background: false });
    if (!authenticated) {
      const err = new Error('session not established');
      // @ts-expect-error enrich
      err.code = 'SESSION_NOT_SAVED';
      // @ts-expect-error enrich
      err.status = 200;
      setSessionState('anonymous');
      throw err;
    }
    return data;
  }, [fetchStatus]);

  const logout = useCallback(async () => {
    try {
      await commandApi.sessionLogout();
    } finally {
      csrfRef.current = '';
      setExpiresAt(null);
      setSessionState('anonymous');
      setTransientError('');
    }
  }, []);

  const csrf = useCallback(() => csrfRef.current, []);

  return {
    sessionState,
    authenticated: sessionState === 'authenticated',
    expiresAt,
    commandsEnabled,
    disabledReason,
    transientError,
    login,
    logout,
    csrf,
    commandFetch,
  };
}

export function randomIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
