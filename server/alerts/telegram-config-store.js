import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const CONFIG_KEY_HEADER = 'x-config-key';

/** @typedef {{ enabled: boolean, botToken: string, chatId: string, configKey: string | null, source: 'ui' | 'env' | 'none' }} TelegramConfig */

export class TelegramConfigStore {
  constructor() {
    /** @type {TelegramConfig} */
    this.config = {
      enabled: false,
      botToken: '',
      chatId: '',
      configKey: null,
      source: 'none',
    };
    this.filePath =
      process.env.TELEGRAM_CONFIG_PATH ||
      path.join(process.cwd(), 'data', 'telegram-config.json');
    /** @type {import('pg').Pool | null} */
    this.pool = null;
    this.loaded = false;
  }

  /** @param {import('pg').Pool} pool */
  async initPostgres(pool) {
    this.pool = pool;
    await this.ensurePostgresTable();
    const row = await this.loadFromPostgres();
    if (row) {
      this.applyRow(row, 'ui');
      this.loaded = true;
    }
  }

  async initFile() {
    const row = await this.loadFromFile();
    if (row) {
      this.applyRow(row, 'ui');
      this.loaded = true;
    }
  }

  seedFromEnv() {
    if (this.loaded || this.config.botToken) return;

    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    const chatId = process.env.TELEGRAM_CHAT_ID || '';
    const enabled = process.env.TELEGRAM_ALERTS_ENABLED === 'true';

    if (!token && !chatId && !enabled) return;

    this.config = {
      enabled: enabled || Boolean(token && chatId),
      botToken: token,
      chatId,
      configKey: null,
      source: 'env',
    };
    this.loaded = true;
  }

  hasConfig() {
    return Boolean(this.config.botToken || this.config.chatId || this.config.enabled);
  }

  /** @returns {TelegramConfig} */
  get() {
    return { ...this.config };
  }

  getPublicStatus() {
    const { enabled, botToken, chatId, configKey, source } = this.config;
    const configured = Boolean(enabled && botToken && chatId);

    return {
      enabled,
      configured,
      tokenSet: Boolean(botToken),
      chatIdSet: Boolean(chatId),
      chatIdMasked: maskChatId(chatId),
      source,
      uiConfigurable: source !== 'env',
      hasConfigKey: Boolean(configKey),
      testAvailable: configured,
    };
  }

  /**
   * @param {{ enabled?: boolean, botToken?: string, chatId?: string }} input
   * @param {string | null | undefined} providedKey
   */
  async save(input, providedKey) {
    if (this.config.source === 'env') {
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
      source: 'ui',
    };

    if (!next.configKey) {
      next.configKey = crypto.randomBytes(24).toString('base64url');
    }

    this.config = next;
    this.loaded = true;
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
    };

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO telegram_config (id, enabled, bot_token, chat_id, config_key, updated_at)
         VALUES (1, $1, $2, $3, $4, NOW())
         ON CONFLICT (id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           bot_token = EXCLUDED.bot_token,
           chat_id = EXCLUDED.chat_id,
           config_key = EXCLUDED.config_key,
           updated_at = NOW()`,
        [payload.enabled, payload.botToken, payload.chatId, payload.configKey],
      );
      return;
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), 'utf8');
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
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async loadFromPostgres() {
    if (!this.pool) return null;
    const res = await this.pool.query(
      'SELECT enabled, bot_token, chat_id, config_key FROM telegram_config WHERE id = 1',
    );
    if (!res.rows.length) return null;
    const row = res.rows[0];
    if (!row.bot_token && !row.chat_id && !row.enabled) return null;
    return {
      enabled: Boolean(row.enabled),
      botToken: String(row.bot_token ?? ''),
      chatId: String(row.chat_id ?? ''),
      configKey: row.config_key ? String(row.config_key) : null,
    };
  }

  async loadFromFile() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      if (!data.botToken && !data.chatId && !data.enabled) return null;
      return {
        enabled: Boolean(data.enabled),
        botToken: String(data.botToken ?? ''),
        chatId: String(data.chatId ?? ''),
        configKey: data.configKey ? String(data.configKey) : null,
      };
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') return null;
      console.error('[telegram-config] file load error:', e.message);
      return null;
    }
  }

  /** @param {{ enabled: boolean, botToken: string, chatId: string, configKey: string | null }} row */
  applyRow(row, source) {
    this.config = {
      enabled: row.enabled,
      botToken: row.botToken,
      chatId: row.chatId,
      configKey: row.configKey,
      source,
    };
  }
}

/** @param {string} chatId */
function maskChatId(chatId) {
  if (!chatId) return '';
  const s = String(chatId);
  if (s.length <= 4) return '****';
  return `***${s.slice(-4)}`;
}
