export function isCommandsGloballyEnabled() {
  return process.env.COMMANDS_ENABLED === 'true';
}

/** @param {boolean} hasPostgres */
export function isCommandsAvailable(hasPostgres) {
  if (!isCommandsGloballyEnabled()) return { enabled: false, reason: 'DISABLED_BY_ADMIN' };
  if (process.env.NODE_ENV === 'production' && !hasPostgres) {
    return { enabled: false, reason: 'POSTGRES_REQUIRED' };
  }
  if (!process.env.COMMAND_SIGNING_SECRET) {
    return { enabled: false, reason: 'SIGNING_SECRET_MISSING' };
  }
  if (!process.env.COMMAND_ADMIN_PASSWORD_HASH || !process.env.COMMAND_SESSION_SECRET) {
    return { enabled: false, reason: 'SESSION_NOT_CONFIGURED' };
  }
  return { enabled: true, reason: null };
}

export function signingSecret() {
  return process.env.COMMAND_SIGNING_SECRET || '';
}

export function agentAuthToken() {
  return process.env.AGENT_AUTH_TOKEN || '';
}

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export function isLocalDevAuthBypass() {
  return !isProduction() && process.env.AGENT_AUTH_TOKEN === '';
}
