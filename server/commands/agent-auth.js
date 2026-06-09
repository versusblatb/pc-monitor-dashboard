import { createHash } from 'node:crypto';
import { constantTimeEqual } from './crypto-utils.js';
import { agentAuthToken, isLocalDevAuthBypass, isProduction } from './commands-config.js';

const AUTH_TIMEOUT_MS = 10_000;
const MAX_AUTH_ATTEMPTS = 5;

/** @type {WeakMap<import('ws').WebSocket, { authenticated: boolean, deviceId: string|null, hostname: string|null, agentVersion: string|null, capabilities: object|null, authAttempts: number, authTimer: ReturnType<typeof setTimeout>|null }>} */
const agentState = new WeakMap();

/** @param {import('ws').WebSocket} ws */
export function initAgentConnection(ws) {
  const state = {
    authenticated: isLocalDevAuthBypass(),
    deviceId: isLocalDevAuthBypass() ? 'local-dev' : null,
    hostname: null,
    agentVersion: null,
    capabilities: null,
    authAttempts: 0,
    authTimer: null,
  };
  agentState.set(ws, state);

  if (!state.authenticated) {
    state.authTimer = setTimeout(() => {
      if (!getAgentState(ws)?.authenticated) {
        ws.close(4001, 'agent auth timeout');
      }
    }, AUTH_TIMEOUT_MS);
  }
  return state;
}

/** @param {import('ws').WebSocket} ws */
export function getAgentState(ws) {
  return agentState.get(ws) ?? null;
}

/** @param {import('ws').WebSocket} ws */
export function isAgentAuthenticated(ws) {
  return Boolean(getAgentState(ws)?.authenticated);
}

/**
 * @param {import('ws').WebSocket} ws
 * @param {object} payload
 */
export function handleAgentAuth(ws, payload) {
  const state = getAgentState(ws);
  if (!state) return { ok: false, error: 'NO_STATE' };
  if (state.authenticated) return { ok: true, deviceId: state.deviceId };

  state.authAttempts += 1;
  if (state.authAttempts > MAX_AUTH_ATTEMPTS) {
    ws.close(4003, 'too many auth attempts');
    return { ok: false, error: 'TOO_MANY_ATTEMPTS' };
  }

  const expected = agentAuthToken();
  const token = String(payload?.token ?? '');

  if (!isLocalDevAuthBypass()) {
    if (!expected || !token || !constantTimeEqual(token, expected)) {
      if (isProduction()) ws.close(4003, 'agent auth failed');
      return { ok: false, error: 'INVALID_TOKEN' };
    }
  }

  const hostname = String(payload?.hostname ?? 'unknown').slice(0, 64);
  state.authenticated = true;
  state.hostname = hostname;
  state.agentVersion = String(payload?.agentVersion ?? '');
  state.capabilities = payload?.capabilities && typeof payload.capabilities === 'object'
    ? payload.capabilities
    : defaultCapabilities();
  state.deviceId = deriveDeviceId(hostname);

  if (state.authTimer) clearTimeout(state.authTimer);
  state.authTimer = null;

  return { ok: true, deviceId: state.deviceId, capabilities: state.capabilities };
}

/** @param {string} hostname */
function deriveDeviceId(hostname) {
  return createHash('sha256').update(hostname).digest('hex').slice(0, 16);
}

export function defaultCapabilities() {
  return {
    lock: true,
    sleep: true,
    hibernate: true,
    shutdown: true,
    restart: true,
    launchApp: true,
    stopApp: true,
    clearTemp: true,
    screenshot: false,
  };
}

/** @param {import('ws').WebSocket} ws @param {object[]} apps */
export function updateAgentApps(ws, apps) {
  const state = getAgentState(ws);
  if (!state?.capabilities) return false;
  state.capabilities = {
    ...state.capabilities,
    apps: apps.map((a) => ({
      id: a.id,
      label: a.label,
      allowStop: Boolean(a.allowStop),
    })),
  };
  return true;
}

/** @param {import('ws').WebSocket} ws */
export function clearAgentState(ws) {
  const state = getAgentState(ws);
  if (state?.authTimer) clearTimeout(state.authTimer);
  agentState.delete(ws);
}
