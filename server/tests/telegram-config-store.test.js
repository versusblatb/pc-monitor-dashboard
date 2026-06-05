import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { TelegramConfigStore } from '../alerts/telegram-config-store.js';

describe('TelegramConfigStore', () => {
  /** @type {string} */
  let tmpDir;
  /** @type {TelegramConfigStore} */
  let store;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tg-config-'));
    store = new TelegramConfigStore();
    store.filePath = path.join(tmpDir, 'telegram-config.json');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('saves config and requires key on update', async () => {
    const first = await store.save(
      { enabled: true, botToken: 'token1', chatId: '111' },
      null,
    );
    assert.ok(first.configKey);
    assert.equal(store.get().botToken, 'token1');

    await assert.rejects(
      () => store.save({ enabled: false }, 'wrong-key'),
      /invalid config key/,
    );

    const second = await store.save({ enabled: false }, first.configKey);
    assert.equal(second.status.enabled, false);
    assert.equal(store.get().botToken, 'token1');
  });

  it('persists to file', async () => {
    const { configKey } = await store.save(
      { enabled: true, botToken: 'tok', chatId: '42' },
      null,
    );

    const store2 = new TelegramConfigStore();
    store2.filePath = store.filePath;
    await store2.initFile();

    assert.equal(store2.get().chatId, '42');
    assert.equal(store2.get().configKey, configKey);
  });
});
