CREATE TABLE IF NOT EXISTS remote_commands (
  id UUID PRIMARY KEY,
  device_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  params_json JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  requested_by TEXT NOT NULL DEFAULT 'command-session',
  nonce TEXT NOT NULL,
  signature TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_json JSONB,
  error_code TEXT,
  idempotency_key TEXT,
  cancelled_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_remote_commands_status ON remote_commands (status);
CREATE INDEX IF NOT EXISTS idx_remote_commands_device ON remote_commands (device_id);
CREATE INDEX IF NOT EXISTS idx_remote_commands_expires ON remote_commands (expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_remote_commands_idempotency
  ON remote_commands (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS command_audit_log (
  id BIGSERIAL PRIMARY KEY,
  command_id UUID,
  event_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  device_id TEXT,
  safe_metadata_json JSONB NOT NULL DEFAULT '{}',
  ip_hash TEXT,
  user_agent_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_command_audit_command ON command_audit_log (command_id);
CREATE INDEX IF NOT EXISTS idx_command_audit_timestamp ON command_audit_log (timestamp);
