CREATE TABLE IF NOT EXISTS metric_history (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL,
  hostname VARCHAR(64) NOT NULL,
  cpu SMALLINT,
  gpu SMALLINT,
  ram SMALLINT,
  cpu_temp SMALLINT,
  gpu_temp SMALLINT,
  download_bps BIGINT,
  upload_bps BIGINT,
  disk_summary JSONB,
  status VARCHAR(32)
);

CREATE INDEX IF NOT EXISTS idx_metric_history_ts ON metric_history (ts DESC);
CREATE INDEX IF NOT EXISTS idx_metric_history_hostname ON metric_history (hostname);
