import http from 'node:http';
import { WebSocketServer } from 'ws';
import { AlertManager } from './alerts/alert-manager.js';
import { TelegramConfigStore } from './alerts/telegram-config-store.js';
import { HistoryManager } from './history/history-manager.js';
import { describeMetricsShape } from './lib/metrics-shape.js';
import {
  mergeClientMetrics,
  normalizeAgentMessage,
  toClientPayload,
  validateIncomingSize,
} from './lib/normalize-metrics.js';
import { getEnvIncompleteWarning } from './alerts/telegram-env.js';
import { setCors, corsOrigin } from './middleware/cors.js';
import { rateLimit } from './middleware/rate-limit.js';
import { handleAlertsRoute } from './routes/alerts.js';
import { handleApiRoute } from './routes/api.js';
import { StatusResolver } from './status/status-resolver.js';

const PORT = Number(process.env.PORT) || 3847;
const HOST = process.env.HOST || '0.0.0.0';
const OFFLINE_TIMEOUT_MS = Number(process.env.OFFLINE_TIMEOUT_MS) || 12_000;

/** @type {import('ws').WebSocket | null} */
let agentSocket = null;
/** @type {Set<import('ws').WebSocket>} */
const dashboards = new Set();

/** @type {Record<string, unknown> | null} */
let latest = null;
let agentLastSeen = 0;
let deviceStatus = 'offline';

const statusResolver = new StatusResolver();
const history = new HistoryManager();
const telegramConfig = new TelegramConfigStore();
const alerts = new AlertManager(telegramConfig);

async function initPostgres() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: url,
      ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    await history.initPostgres(pool);
    await telegramConfig.initPostgres(pool);
    console.log('[server] PostgreSQL history + telegram config enabled');
    return pool;
  } catch (e) {
    console.error('[server] PostgreSQL unavailable, using memory store:', e.message);
    return null;
  }
}

async function initTelegramConfig() {
  const pool = await initPostgres();
  if (!pool) {
    await telegramConfig.initFile();
  }
  telegramConfig.applyEnvOverrideIfComplete();

  const envWarn = getEnvIncompleteWarning();
  if (envWarn) console.warn('[server]', envWarn);

  if (telegramConfig.isManagedByEnv()) {
    console.log('[server] Telegram alerts loaded from env (managed)');
  } else if (alerts.configured) {
    console.log('[server] Telegram alerts loaded from saved config');
  }
}

function json(res, req, status, body) {
  setCors(req, res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function isAgentOnline() {
  return agentSocket?.readyState === 1 && Date.now() - agentLastSeen < OFFLINE_TIMEOUT_MS;
}

function updateStatus() {
  const { status, changed } = statusResolver.resolve({
    online: isAgentOnline(),
    metrics: latest,
  });
  deviceStatus = status;
  alerts.onStatusChange({ status, changed, online: isAgentOnline(), metrics: latest });
  return { status, changed };
}

function broadcastMetrics() {
  const payload = { ...latest, status: deviceStatus, lastSeen: agentLastSeen };
  const out = JSON.stringify({ type: 'metrics', payload });
  for (const d of dashboards) {
    if (d.readyState === 1) d.send(out);
  }
}

function broadcastStatus() {
  const msg = JSON.stringify({
    type: 'status',
    payload: {
      online: isAgentOnline(),
      metrics: latest,
      status: deviceStatus,
      lastSeen: agentLastSeen,
    },
  });
  for (const d of dashboards) {
    if (d.readyState === 1) d.send(msg);
  }
}

let firstV2DiagLogged = false;

function logFirstV2Diagnostics(msg, normalized, incoming) {
  if (firstV2DiagLogged || normalized.schemaVersion < 2) return;
  firstV2DiagLogged = true;

  const payload = msg?.payload && typeof msg.payload === 'object' ? msg.payload : {};
  const topKeys = Object.keys(payload);
  const sections = {
    system: Boolean(incoming.system),
    cpuInfo: Boolean(incoming.cpuInfo),
    gpuInfo: Boolean(incoming.gpuInfo),
    memoryInfo: Boolean(incoming.memoryInfo),
    network: Boolean(incoming.network),
    processes: incoming.processes != null,
    disks: Array.isArray(incoming.disks) ? incoming.disks.length : 0,
  };

  console.log('[server] first schema v2 metrics:', {
    schemaVersion: normalized.schemaVersion,
    topLevelKeys: topKeys,
    validation: 'ok',
    normalizedSections: sections,
    payloadBytes: Buffer.byteLength(String(raw), 'utf8'),
    agentVersion: incoming.agentVersion ?? null,
    hostname: incoming.hostname ?? null,
  });
}

function handleAgentMetrics(raw) {
  try {
    validateIncomingSize(raw);
    const msg = JSON.parse(String(raw));
    const normalized = normalizeAgentMessage(msg);
    if (!normalized) {
      console.warn('[server] metrics rejected: invalid message shape', {
        type: msg?.type,
        reason: 'normalizeAgentMessage returned null',
      });
      return;
    }

    const incoming = toClientPayload(normalized);
    latest = mergeClientMetrics(latest, incoming);
    agentLastSeen = Date.now();

    logFirstV2Diagnostics(msg, normalized, incoming);

    const { status } = updateStatus();
    history.onMetrics(latest, status);
    broadcastMetrics();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[server] metrics parse error:', message);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    setCors(req, res);
    res.writeHead(204);
    res.end();
    return;
  }

  const isAlertsPost =
    req.method === 'POST' &&
    (url.pathname === '/api/alerts/config' ||
      url.pathname === '/api/alerts/bot-info' ||
      url.pathname === '/api/alerts/discover-chat' ||
      url.pathname === '/api/alerts/test');

  if (req.method !== 'GET' && !isAlertsPost) {
    json(res, req, 405, { error: 'method not allowed' });
    return;
  }

  if (!rateLimit(req)) {
    json(res, req, 429, { error: 'rate limit exceeded' });
    return;
  }

  if (url.pathname === '/api/health' || url.pathname === '/health') {
    json(res, req, 200, {
      ok: true,
      agentOnline: isAgentOnline(),
      dashboards: dashboards.size,
      uptime: process.uptime(),
      schemaVersion: latest?.schemaVersion ?? null,
      status: deviceStatus,
      historyPoints: history.memory.size,
      telegram: alerts.configured,
    });
    return;
  }

  if (url.pathname.startsWith('/api/alerts/')) {
    const handled = await handleAlertsRoute(req, res, url, alerts, telegramConfig, json);
    if (handled) return;
  }

  if (url.pathname === '/api/debug/metrics-shape' && process.env.DEBUG_METRICS === 'true') {
    json(res, req, 200, describeMetricsShape(latest));
    return;
  }

  const api = await handleApiRoute(url, {
    isAgentOnline,
    latest,
    agentLastSeen,
    status: deviceStatus,
    history,
  });

  if (api) {
    json(res, req, api.status, api.body);
    return;
  }

  if (url.pathname === '/api/stream') {
    setCors(req, res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = () => {
      res.write(
        `data: ${JSON.stringify({ online: isAgentOnline(), metrics: latest, status: deviceStatus })}\n\n`,
      );
    };
    send();
    const id = setInterval(send, 1000);
    req.on('close', () => clearInterval(id));
    return;
  }

  json(res, req, 404, { error: 'not found' });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const role = url.searchParams.get('role');

  if (role === 'agent') {
    if (agentSocket && agentSocket !== ws && agentSocket.readyState === 1) {
      console.log('[server] agent already connected, rejecting duplicate');
      ws.close(4000, 'agent already connected');
      return;
    }
    agentSocket = ws;
    agentLastSeen = Date.now();
    updateStatus();
    console.log('[server] agent connected');
    ws.on('message', handleAgentMetrics);
    ws.on('close', () => {
      if (agentSocket === ws) agentSocket = null;
      console.log('[server] agent disconnected');
      updateStatus();
      broadcastStatus();
    });
    return;
  }

  dashboards.add(ws);
  console.log('[server] dashboard connected', dashboards.size);

  ws.send(
    JSON.stringify({
      type: 'status',
      payload: {
        online: isAgentOnline(),
        metrics: latest,
        status: deviceStatus,
        lastSeen: agentLastSeen,
      },
    }),
  );

  ws.on('close', () => {
    dashboards.delete(ws);
    console.log('[server] dashboard disconnected', dashboards.size);
  });
});

setInterval(() => {
  const prev = deviceStatus;
  updateStatus();
  history.flushPending();
  if (deviceStatus !== prev || !isAgentOnline()) broadcastStatus();
}, 3000);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] port ${PORT} already in use`);
    process.exit(1);
  }
  throw err;
});

await initTelegramConfig();

server.listen(PORT, HOST, () => {
  console.log(`[server] http://localhost:${PORT}  ws://localhost:${PORT}`);
  console.log(`[server] CORS origin: ${corsOrigin({ headers: {} })}`);
});
