import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  getEnvIncompleteWarning,
  getEnvTelegramConfig,
  isEnvManaged,
  trimEnv,
} from '../alerts/telegram-env.js';

describe('telegram env detection', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    delete process.env.TELEGRAM_ALERTS_ENABLED;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  afterEach(() => {
    process.env = { ...prev };
  });

  it('trimEnv rejects whitespace', () => {
    assert.equal(trimEnv('   '), '');
    assert.equal(trimEnv(null), '');
  });

  it('only TELEGRAM_ALERTS_ENABLED → managedByEnv false', () => {
    process.env.TELEGRAM_ALERTS_ENABLED = 'true';
    assert.equal(isEnvManaged(), false);
    assert.equal(getEnvTelegramConfig(), null);
  });

  it('empty token/chat ID → managedByEnv false', () => {
    process.env.TELEGRAM_BOT_TOKEN = '   ';
    process.env.TELEGRAM_CHAT_ID = '';
    assert.equal(isEnvManaged(), false);
  });

  it('only token → managedByEnv false', () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
    assert.equal(isEnvManaged(), false);
    assert.match(getEnvIncompleteWarning() ?? '', /CHAT_ID/i);
  });

  it('only chat ID → managedByEnv false', () => {
    process.env.TELEGRAM_CHAT_ID = '999';
    assert.equal(isEnvManaged(), false);
    assert.match(getEnvIncompleteWarning() ?? '', /BOT_TOKEN/i);
  });

  it('token + chat ID → managedByEnv true', () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';
    assert.equal(isEnvManaged(), true);
    assert.equal(getEnvTelegramConfig()?.botToken, '123:ABC');
    assert.equal(getEnvTelegramConfig()?.chatId, '999');
  });
});
