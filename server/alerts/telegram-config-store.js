import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getEnvIncompleteWarning,
  getEnvTelegramConfig,
  isEnvManaged,
  trimEnv,
} from './telegram-env.js';

const CONFIG_KEY_HEADER = 'x-config-key';

/** @typedef {'database'|'file'|'env'|'none'} ConfigSource */

/** @typedef {{ enabled: boolean, botToken: string, chatId: string, configKey: string | null, botUsername: string | null, source: ConfigSource }} TelegramConfig */

export class TelegramConfigStore {
  constructor() {
    /** @type {TelegramConfig} */
    this.config = {
      enabled: false,
      botToken: '',
      chatId: '',
      configKey: null,
      botUsername: null,
      source: 'none',
    };
    this.filePath =
      process.env.TELEGRAM_CONFIG_PATH ||
      path.join(process.cwd(), 'data', 'telegram-config.json');
    /** @type {import('pg').Pool | null} */
    this.pool = null;
    this.storageKind = /** @type {'database'|'file'|null} */ (null);
  }

  /** @param {import('pg').Pool} pool */
  async initPostgres(pool) {
    this.pool = pool;
    await this.ensurePostgresTable();
    const row = await this.loadFromPostgres();
    if (row) {
      this.applyRow(row, 'database');
      this.storageKind = 'database';
    }
  }

  async initFile() {
    const row = await this.loadFromFile();
    if (row) {
      this.applyRow(row, 'file');
      this.storageKind = 'file';
    }
  }

  /** Priority: complete env pair > database/file > empty */
  applyEnvOverrideIfComplete() {
    const envCfg = getEnvTelegramConfig();
    if (!envCfg) return;

    this.config = {
      enabled: envCfg.enabled,
      botToken: envCfg.botToken,
      chatId: envCfg.chatId,
      configKey: null,
      botUsername: envCfg.botUsername,
      source: 'env',
    };
  }

  isManagedByEnv() {
    return isEnvManaged();
  }

  /** @returns {TelegramConfig} */
  get() {
    return { ...this.config };
  }

  getPublicStatus() {
    const { enabled, botToken, chatId, botUsername, source } = this.config;
    const managedByEnv = isEnvManaged();
    const chatConfigured = Boolean(trimEnv(chatId));
    const tokenSet = Boolean(trimEnv(botToken));
    const configured = Boolean(enabled && tokenSet && chatConfigured);

    return {
      configured,
      enabled,
      source: managedByEnv ? 'env' : source,
      managedByEnv,
      botUsername: botUsername || null,
      chatConfigured,
      tokenSet,
      chatIdSet: chatConfigured,
      chatIdMasked: maskChatId(chatId),
      uiConfigurable: !managedByEnv,
      hasConfigKey: Boolean(this.config.configKey),
      testAvailable: configured,
      envIncompleteWarning: getEnvIncompleteWarning(),
    };
  }

  /**
   * @param {{ enabled?: boolean, botToken?: string, chatId?: string, botUsername?: string }} input
   * @param {string | null | undefined} providedKey
   */
  async save(input, providedKey) {
    if (isEnvManaged()) {
      throw new Error('config locked by server env');
    }

    if (this.config.configKey) {
      const keyOk = providedKey && providedKey === this.config.configKey;
      const reclaim =
        !keyOk &&
        input.botToken?.trim() &&
        input.chatId?.trim() &&
        input.botToken.trim() === this.config.botToken &&
        input.chatId.trim() === this.config.chatId;

      if (!keyOk && !reclaim) {
        throw new Error('invalid config key');
      }
    }

    const next = {
      enabled: input.enabled ?? this.config.enabled,
      botToken: input.botToken?.trim() || this.config.botToken,
      chatId: input.chatId?.trim() || this.config.chatId,
      configKey: this.config.configKey,
      botUsername: input.botUsername?.trim() || this.config.botUsername,
      source: this.storageKind || (this.pool ? 'database' : 'file'),
    };

    if (!next.configKey) {
      next.configKey = crypto.randomBytes(24).toString('base64url');
    }

    this.config = next;
    if (!this.storageKind) this.storageKind = this.pool ? 'database' : 'file';
    await this.persist();

    return {
      configKey: next.configKey,
      status: this.getPublicStatus(),
    };
  }

  assertConfigKey(providedKey) {
    if (!this.config.configKey) return true;
    return Boolean(providedKey && providedKey === this.config.configKey);
  }

  static readConfigKey(req) {
    const raw = req.headers[CONFIG_KEY_HEADER];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  }

  async persist() {
    const payload = {
      enabled: this.config.enabled,
      botToken: this.config.botToken,
      chatId: this.config.chatId,
      configKey: this.config.configKey,
      botUsername: this.config.botUsername,
    };

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO telegram_config (id, enabled, bot_token, chat_id, config_key, bot_username, updated_at)
         VALUES (1, $1, $2, $3, $4, $5, NOW())
         ON CONFLICT (id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           bot_token = EXCLUDED.bot_token,
           chat_id = EXCLUDED.chat_id,
           config_key = EXCLUDED.config_key,
           bot_username = EXCLUDED.bot_username,
           updated_at = NOW()`,
        [payload.enabled, payload.botToken, payload.chatId, payload.configKey, payload.botUsername],
      );
      this.storageKind = 'database';
      return;
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), 'utf8');
    this.storageKind = 'file';
  }

  async ensurePostgresTable() {
    if (!this.pool) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_config (
        id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        enabled BOOLEAN NOT NULL DEFAULT false,
        bot_token TEXT NOT NULL DEFAULT '',
        chat_id TEXT NOT NULL DEFAULT '',
        config_key TEXT,
        bot_username TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      ALTER TABLE telegram_config ADD COLUMN IF NOT EXISTS bot_username TEXT
    `).catch(() => {});
  }

  async loadFromPostgres() {
    if (!this.pool) return null;
    const res = await this.pool.query(
      'SELECT enabled, bot_token, chat_id, config_key, bot_username FROM telegram_config WHERE id = 1',
    );
    if (!res.rows.length) return null;
    const row = res.rows[0];
    if (!trimEnv(row.bot_token) && !trimEnv(row.chat_id) && !row.enabled) return null;
    return rowToConfig(row);
  }

  async loadFromFile() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      if (!trimEnv(data.botToken) && !trimEnv(data.chatId) && !data.enabled) return null;
      return {
        enabled: Boolean(data.enabled),
        botToken: String(data.botToken ?? ''),
        chatId: String(data.chatId ?? ''),
        configKey: data.configKey ? String(data.configKey) : null,
        botUsername: data.botUsername ? String(data.botUsername) : null,
      };
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') return null;
      console.error('[telegram-config] file load error:', e.message);
      return null;
    }
  }

  /** @param {{ enabled: boolean, botToken: string, chatId: string, configKey: string | null, botUsername?: string | null }} row @param {ConfigSource} source */
  applyRow(row, source) {
    this.config = {
      enabled: row.enabled,
      botToken: row.botToken,
      chatId: row.chatId,
      configKey: row.configKey,
      botUsername: row.botUsername ?? null,
      source,
    };
  }
}

/** @param {Record<string, unknown>} row */
function rowToConfig(row) {
  return {
    enabled: Boolean(row.enabled),
    botToken: String(row.bot_token ?? ''),
    chatId: String(row.chat_id ?? ''),
    configKey: row.config_key ? String(row.config_key) : null,
    botUsername: row.bot_username ? String(row.bot_username) : null,
  };
}

/** @param {string} chatId */
function maskChatId(chatId) {
  if (!trimEnv(chatId)) return '';
  const s = String(chatId);
  if (s.length <= 4) return '****';
  return `***${s.slice(-4)}`;
}
