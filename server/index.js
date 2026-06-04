import http from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 3847;
const HOST = process.env.HOST || '0.0.0.0';

/** @type {import('ws').WebSocket | null} */
let agentSocket = null;
/** @type {Set<import('ws').WebSocket>} */
const dashboards = new Set();

/** @type {{ cpu: number, ram: number, disk: number, ts: number, hostname: string } | null} */
let latest = null;
let agentLastSeen = 0;

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

function isAgentOnline() {
  return agentSocket?.readyState === 1 && Date.now() - agentLastSeen < 10_000;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (url.pathname === '/api/health') {
    json(res, 200, {
      ok: true,
      agentOnline: isAgentOnline(),
      dashboards: dashboards.size,
      uptime: process.uptime(),
    });
    return;
  }

  if (url.pathname === '/api/metrics') {
    json(res, 200, {
      online: isAgentOnline(),
      metrics: latest,
      stale: !isAgentOnline(),
    });
    return;
  }

  if (url.pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    const send = () => {
      res.write(`data: ${JSON.stringify({ online: isAgentOnline(), metrics: latest })}\n\n`);
    };
    send();
    const id = setInterval(send, 1000);
    req.on('close', () => clearInterval(id));
    return;
  }

  json(res, 404, { error: 'not found' });
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const role = url.searchParams.get('role');

  if (role === 'agent') {
    // Keep existing agent if still alive — avoids fight when two agents reconnect
    if (agentSocket && agentSocket !== ws && agentSocket.readyState === 1) {
      console.log('[server] agent already connected, rejecting duplicate');
      ws.close(4000, 'agent already connected');
      return;
    }
    agentSocket = ws;
    agentLastSeen = Date.now();
    console.log('[server] agent connected');

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'metrics' && msg.payload) {
          latest = msg.payload;
          agentLastSeen = Date.now();
          const out = JSON.stringify({ type: 'metrics', payload: latest });
          for (const d of dashboards) {
            if (d.readyState === 1) d.send(out);
          }
        }
      } catch {
        /* ignore bad payload */
      }
    });

    ws.on('close', () => {
      if (agentSocket === ws) agentSocket = null;
      console.log('[server] agent disconnected');
      broadcastStatus();
    });
    return;
  }

  dashboards.add(ws);
  console.log('[server] dashboard connected', dashboards.size);

  ws.send(
    JSON.stringify({
      type: 'status',
      payload: { online: isAgentOnline(), metrics: latest },
    }),
  );

  ws.on('close', () => {
    dashboards.delete(ws);
    console.log('[server] dashboard disconnected', dashboards.size);
  });
});

function broadcastStatus() {
  const msg = JSON.stringify({
    type: 'status',
    payload: { online: isAgentOnline(), metrics: latest },
  });
  for (const d of dashboards) {
    if (d.readyState === 1) d.send(msg);
  }
}

setInterval(broadcastStatus, 3000);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[server] port ${PORT} already in use — stop the old server first:\n` +
        `  Get-NetTCPConnection -LocalPort ${PORT} | Select OwningProcess\n` +
        `  Stop-Process -Id <PID> -Force`,
    );
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`[server] http://localhost:${PORT}  ws://localhost:${PORT}`);
});
