import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

export const AGENT_VERSION = pkg.version;
export const SCHEMA_VERSION = 2;

export const SERVER_URL =
  process.env.SERVER_URL || 'wss://pc-monitor-dashboard.onrender.com?role=agent';

export const FAST_INTERVAL_MS = Number(process.env.INTERVAL_MS) || 1000;
export const MEDIUM_INTERVAL_MS = Number(process.env.MEDIUM_INTERVAL_MS) || 2500;
export const SLOW_INTERVAL_MS = Number(process.env.SLOW_INTERVAL_MS) || 5000;
export const STATIC_REFRESH_MS = Number(process.env.STATIC_REFRESH_MS) || 3_600_000;

export const COLLECT_TIMEOUT_MS = Number(process.env.COLLECT_TIMEOUT_MS) || 6000;
export const MAX_WS_BYTES = 64 * 1024;
export const MAX_PROCESS_NAME_LEN = 64;
export const TOP_PROCESSES = 10;

export const RECONNECT_BASE_MS = Number(process.env.RECONNECT_BASE_MS) || 1000;
export const RECONNECT_MAX_MS = Number(process.env.RECONNECT_MAX_MS) || 60_000;
export const DUPLICATE_AGENT_DELAY_MS = 30_000;

export const AGENT_AUTH_TOKEN = process.env.AGENT_AUTH_TOKEN || '';
export const COMMAND_SIGNING_SECRET = process.env.COMMAND_SIGNING_SECRET || '';
export const ALLOW_REMOTE_COMMANDS = process.env.ALLOW_REMOTE_COMMANDS === 'true';
export const ALLOW_SCREENSHOT = process.env.ALLOW_SCREENSHOT === 'true';
export const ALLOW_UNLOCK = process.env.ALLOW_UNLOCK === 'true';
export const UNLOCK_PASSWORD = process.env.UNLOCK_PASSWORD || '';
export const APPS_CONFIG_PATH = process.env.APPS_CONFIG_PATH || './config/apps.json';
export const SCREENSHOT_TTL_MS = 2 * 60_000;

export const COMMAND_EXECUTION_MODE =
  process.env.COMMAND_EXECUTION_MODE ||
  (process.env.NODE_ENV === 'production' ? 'real' : 'mock');
