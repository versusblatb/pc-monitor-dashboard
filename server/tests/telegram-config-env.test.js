import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { TelegramConfigStore } from '../alerts/telegram-config-store.js';

describe('TelegramConfigStore env priority', () => {
  /** @type {string} */
  let tmpDir;
  const prev = { ...process.env };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-env-'));
    delete process.env.TELEGRAM_ALERTS_ENABLED;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  afterEach(async () => {
    process.env = { ...prev };
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('database config without env → source database, UI available', async () => {
    const store = new TelegramConfigStore();
    store.filePath = path.join(tmpDir, 'telegram-config.json');
    await store.save({ enabled: true, botToken: 'db-token', chatId: '42' }, null);

    const store2 = new TelegramConfigStore();
    store2.filePath = store.filePath;
    await store2.initFile();
    store2.applyEnvOverrideIfComplete();

    const status = store2.getPublicStatus();
    assert.equal(status.source, 'file');
    assert.equal(status.managedByEnv, false);
    assert.equal(status.uiConfigurable, true);
    assert.equal(status.configured, true);
  });

  it('enabled-only env does not lock UI', async () => {
    process.env.TELEGRAM_ALERTS_ENABLED = 'true';
    const store = new TelegramConfigStore();
    store.applyEnvOverrideIfComplete();
    const status = store.getPublicStatus();
    assert.equal(status.managedByEnv, false);
    assert.equal(status.uiConfigurable, true);
    assert.equal(status.configured, false);
  });
});
