import { WebSocket } from 'ws';
import os from 'node:os';
import { collectMetrics, warmupCpuBaseline } from './metrics.js';

const SERVER_URL = process.env.SERVER_URL || 'ws://127.0.0.1:3847?role=agent';
const INTERVAL_MS = Number(process.env.INTERVAL_MS) || 1000;

function connect() {
  const ws = new WebSocket(SERVER_URL);
  let timer = null;

  ws.on('open', () => {
    console.log('[agent] connected to', SERVER_URL);
    warmupCpuBaseline();
    timer = setInterval(() => {
      if (ws.readyState === 1) {
        const payload = collectMetrics();
        ws.send(JSON.stringify({ type: 'metrics', payload }));
      }
    }, INTERVAL_MS);
  });

  ws.on('close', (code) => {
    clearInterval(timer);
    if (code === 4000) {
      console.error('[agent] another agent already active — retry in 30s');
      setTimeout(connect, 30_000);
      return;
    }
    console.log('[agent] disconnected, retry in 3s');
    setTimeout(connect, 3000);
  });

  ws.on('error', (err) => {
    console.error('[agent]', err.message);
    ws.close();
  });
}

console.log('[agent] PC Monitor Agent —', os.platform(), os.hostname());
connect();
