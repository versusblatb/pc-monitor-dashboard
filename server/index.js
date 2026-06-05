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
import { CommandManager } from './commands/command-manager.js';
import {
  clearAgentState,
  getAgentState,
  handleAgentAuth,
  initAgentConnection,
  isAgentAuthenticated,
} from './commands/agent-auth.js';
import { handleCommandSessionRoute } from './routes/command-session.js';
import { handleRemoteControlRoute } from './routes/remote-control.js';
import { createCommandTelegramNotifier } from './commands/telegram-command-alerts.js';

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
const commands = new CommandManager();

commands.dashboards = dashboards;
commands.isAgentOnline = isAgentOnline;
commands.getAgentInfo = () => {
  if (!agentSocket) return null;
  const state = getAgentState(agentSocket);
  if (!state?.authenticated) return null;
  return {
    deviceId: state.deviceId,
    hostname: state.hostname,
    agentVersion: state.agentVersion,
    capabilities: state.capabilities,
  };
};
commands.onTelegramAlert = createCommandTelegramNotifier(async () => {
  if (telegramConfig.isManagedByEnv()) {
    return {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    };
  }
  return telegramConfig.get();
});

/** @type {import('pg').Pool | null} */
let pgPool = null;

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
    await commands.initPostgres(pool);
    pgPool = pool;
    console.log('[server] PostgreSQL history + telegram + commands enabled');
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

  const cmdAvail = commands.availability();
  console.log('[server] remote commands:', cmdAvail.enabled ? 'enabled' : `disabled (${cmdAvail.reason})`);
}

function json(res, req, status, body) {
  setCors(req, res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function isAgentOnline() {
  return agentSocket?.readyState === 1
    && isAgentAuthenticated(agentSocket)
    && Date.now() - agentLastSeen < OFFLINE_TIMEOUT_MS;
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

function logFirstV2Diagnostics(msg, normalized, incoming, rawBytes) {
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
    payloadBytes: rawBytes,
    agentVersion: incoming.agentVersion ?? null,
    hostname: incoming.hostname ?? null,
  });
}

function handleAgentMetrics(raw) {
  if (!agentSocket || !isAgentAuthenticated(agentSocket)) return;

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

    logFirstV2Diagnostics(msg, normalized, incoming, Buffer.byteLength(String(raw), 'utf8'));

    const { status } = updateStatus();
    history.onMetrics(latest, status);
    broadcastMetrics();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[server] metrics parse error:', message);
  }
}

/** @param {import('ws').WebSocket} ws @param {Buffer|string} raw */
async function handleAgentMessage(ws, raw) {
  try {
    validateIncomingSize(raw);
    const msg = JSON.parse(String(raw));

    if (msg.type === 'agent_auth') {
      const result = handleAgentAuth(ws, msg.payload);
      ws.send(JSON.stringify({ type: 'agent_auth_result', payload: result }));
      if (result.ok) {
        commands.agentSocket = ws;
        agentLastSeen = Date.now();
        await commands.onAgentReconnect(ws);
        updateStatus();
        broadcastStatus();
      }
      return;
    }

    if (!isAgentAuthenticated(ws)) return;

    if (msg.type === 'metrics') {
      handleAgentMetrics(raw);
      return;
    }

    if (msg.type === 'command_ack') {
      await commands.handleCommandAck(msg.payload);
      return;
    }

    if (msg.type === 'command_result') {
      await commands.handleCommandResult(msg.payload);
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[server] agent message error:', message);
  }
}

function isCommandPostPath(pathname) {
  return (
    pathname === '/api/command-session/login' ||
    pathname === '/api/command-session/logout' ||
    pathname === '/api/remote-control/commands' ||
    /^\/api\/remote-control\/commands\/[^/]+\/cancel$/.test(pathname)
  );
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

  const isCommandPost = req.method === 'POST' && isCommandPostPath(url.pathname);

  const isCommandGet =
    req.method === 'GET' &&
    (url.pathname.startsWith('/api/command-session/') ||
      url.pathname.startsWith('/api/remote-control/'));

  if (req.method !== 'GET' && !isAlertsPost && !isCommandPost) {
    json(res, req, 405, { error: 'method not allowed' });
    return;
  }

  if (!rateLimit(req)) {
    json(res, req, 429, { error: 'rate limit exceeded' });
    return;
  }

  if (url.pathname === '/api/health' || url.pathname === '/health') {
    const cmdAvail = commands.availability();
    json(res, req, 200, {
      ok: true,
      agentOnline: isAgentOnline(),
      dashboards: dashboards.size,
      uptime: process.uptime(),
      schemaVersion: latest?.schemaVersion ?? null,
      status: deviceStatus,
      historyPoints: history.memory.size,
      telegram: alerts.configured,
      commands: cmdAvail,
    });
    return;
  }

  if (url.pathname.startsWith('/api/alerts/')) {
    const handled = await handleAlertsRoute(req, res, url, alerts, telegramConfig, json);
    if (handled) return;
  }

  if (url.pathname.startsWith('/api/command-session/')) {
    const handled = await handleCommandSessionRoute(req, res, url, commands, json);
    if (handled) return;
  }

  if (url.pathname.startsWith('/api/remote-control/')) {
    const handled = await handleRemoteControlRoute(req, res, url, commands, json);
    if (handled) return;
  }

  if (url.pathname === '/api/debug/metrics-shape' && process.env.DEBUG_METRICS === 'true') {
    json(res, req, 200, describeMetricsShape(latest));
    return;
  }

  if (!isCommandGet) {
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
    initAgentConnection(ws);
    agentLastSeen = Date.now();
    commands.agentSocket = ws;
    console.log('[server] agent connected (awaiting auth)');
    ws.on('message', (raw) => handleAgentMessage(ws, raw));
    ws.on('close', () => {
      if (agentSocket === ws) {
        agentSocket = null;
        commands.agentSocket = null;
      }
      clearAgentState(ws);
      console.log('[server] agent disconnected');
      updateStatus();
      broadcastStatus();
    });
    return;
  }

  dashboards.add(ws);
  commands.dashboards = dashboards;
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
  commands.expireStaleCommands().catch(() => {});
  commands.audit.prune().catch(() => {});
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
