/** @param {string|undefined|null} value */
export function trimEnv(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Env-managed only when BOTH token and chat ID are non-empty after trim.
 */
export function isEnvManaged() {
  const token = trimEnv(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = trimEnv(process.env.TELEGRAM_CHAT_ID);
  return Boolean(token && chatId);
}

export function getEnvTelegramConfig() {
  const token = trimEnv(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = trimEnv(process.env.TELEGRAM_CHAT_ID);
  if (!token || !chatId) return null;

  const enabledFlag = process.env.TELEGRAM_ALERTS_ENABLED === 'true';
  return {
    enabled: enabledFlag || true,
    botToken: token,
    chatId,
    configKey: null,
    botUsername: trimEnv(process.env.TELEGRAM_BOT_USERNAME) || null,
  };
}

export function getEnvIncompleteWarning() {
  const token = trimEnv(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = trimEnv(process.env.TELEGRAM_CHAT_ID);
  const enabled = process.env.TELEGRAM_ALERTS_ENABLED === 'true';

  if (isEnvManaged()) return null;
  if (!token && !chatId && !enabled) return null;

  const missing = [];
  if (!token) missing.push('TELEGRAM_BOT_TOKEN');
  if (!chatId) missing.push('TELEGRAM_CHAT_ID');
  if (enabled && missing.length) {
    return `Incomplete env Telegram config: missing ${missing.join(', ')}. UI configuration is allowed.`;
  }
  if (token && !chatId) return 'TELEGRAM_BOT_TOKEN is set but TELEGRAM_CHAT_ID is empty. UI configuration is allowed.';
  if (chatId && !token) return 'TELEGRAM_CHAT_ID is set but TELEGRAM_BOT_TOKEN is empty. UI configuration is allowed.';
  return null;
}
