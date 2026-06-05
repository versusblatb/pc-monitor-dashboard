CREATE TABLE IF NOT EXISTS telegram_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT false,
  bot_token TEXT NOT NULL DEFAULT '',
  chat_id TEXT NOT NULL DEFAULT '',
  config_key TEXT,
  bot_username TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE telegram_config ADD COLUMN IF NOT EXISTS bot_username TEXT;
