import { WebSocket } from 'ws';
import os from 'node:os';
import {
  AGENT_VERSION,
  DUPLICATE_AGENT_DELAY_MS,
  FAST_INTERVAL_MS,
  MEDIUM_INTERVAL_MS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  SCHEMA_VERSION,
  SERVER_URL,
  SLOW_INTERVAL_MS,
  STATIC_REFRESH_MS,
} from './config.js';
import { buildPayload } from './build-payload.js';
import { patchState, state } from './state.js';
import { createMetricsMessage } from './lib/message.js';
import { collectStatic } from './collectors/static.js';
import {
  collectCpu,
  collectGpu,
  collectMemory,
  collectUptime,
  warmupCpuBaseline,
} from './collectors/fast.js';
import { collectDisks, collectNetwork } from './collectors/medium.js';
import { collectProcesses } from './collectors/slow.js';

/** @type {ReturnType<typeof setInterval>[]} */
const timers = [];
let reconnectAttempt = 0;
let shuttingDown = false;
let connectDiagLogged = false;

function clearTimers() {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
}

function nextBackoffMs() {
  const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempt);
  const jitter = Math.random() * 0.25 * exp;
  return Math.round(exp + jitter);
}

async function refreshStatic() {
  patchState('system', await collectStatic());
}

async function refreshFast() {
  const [cpu, gpu, memory, uptime] = await Promise.allSettled([
    collectCpu(),
    collectGpu(),
    collectMemory(),
    collectUptime(),
  ]);
  if (cpu.status === 'fulfilled') patchState('cpu', cpu.value);
  if (gpu.status === 'fulfilled') patchState('gpu', gpu.value);
  if (memory.status === 'fulfilled') patchState('memory', memory.value);
  if (uptime.status === 'fulfilled') patchState('uptime', uptime.value);
}

async function refreshMedium() {
  const [network, disks] = await Promise.allSettled([collectNetwork(), collectDisks()]);
  if (network.status === 'fulfilled') patchState('network', network.value);
  if (disks.status === 'fulfilled') patchState('disks', disks.value);
}

async function refreshSlow() {
  const processes = await collectProcesses();
  if (processes) patchState('processes', processes);
}

async function bootstrapCollectors() {
  await refreshStatic().catch(() => {});
  await Promise.allSettled([
    refreshFast(),
    refreshMedium(),
    refreshSlow(),
  ]);
}

function logConnectDiagnostics(ws) {
  if (connectDiagLogged) return;
  connectDiagLogged = true;

  try {
    const payload = buildPayload(state);
    const message = createMetricsMessage(payload);
    const bytes = Buffer.byteLength(JSON.stringify(message), 'utf8');
    const procs = state.processes;

    console.log('[agent] connect diagnostics:', {
      schemaVersion: SCHEMA_VERSION,
      agentVersion: AGENT_VERSION,
      hostname: payload.hostname,
      hasSystem: Boolean(state.system && Object.values(state.system).some((v) => v != null && v !== '')),
      hasCpu: state.cpu?.usage != null || state.cpu?.model != null,
      hasGpu: state.gpu?.available || state.gpu?.model != null || state.gpu?.usage != null,
      disks: Array.isArray(state.disks) ? state.disks.length : 0,
      processTotal: procs?.total ?? null,
      topCpu: procs?.topCpu?.length ?? 0,
      topMemory: procs?.topMemory?.length ?? 0,
      hasNetwork: Boolean(state.network?.interface || state.network?.ipv4),
      payloadBytes: bytes,
      wsReady: ws.readyState === 1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent] connect diagnostics failed:', msg);
  }
}

function sendMetrics(ws) {
  if (ws.readyState !== 1) return;
  try {
    const payload = buildPayload(state);
    const message = createMetricsMessage(payload);
    ws.send(JSON.stringify(message));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent] send metrics:', msg);
  }
}

function startCollectors(ws) {
  clearTimers();
  warmupCpuBaseline();

  refreshStatic().catch(() => {});
  refreshFast().catch(() => {});
  refreshMedium().catch(() => {});
  refreshSlow().catch(() => {});

  timers.push(
    setInterval(() => sendMetrics(ws), FAST_INTERVAL_MS),
    setInterval(() => refreshFast().catch(() => {}), FAST_INTERVAL_MS),
    setInterval(() => refreshMedium().catch(() => {}), MEDIUM_INTERVAL_MS),
    setInterval(() => refreshSlow().catch(() => {}), SLOW_INTERVAL_MS),
    setInterval(() => refreshStatic().catch(() => {}), STATIC_REFRESH_MS),
  );
}

function connect() {
  if (shuttingDown) return;

  const ws = new WebSocket(SERVER_URL);

  ws.on('open', async () => {
    reconnectAttempt = 0;
    console.log('[agent] connected to', SERVER_URL);
    await bootstrapCollectors();
    startCollectors(ws);
    logConnectDiagnostics(ws);
    sendMetrics(ws);
  });

  ws.on('close', (code) => {
    clearTimers();
    if (shuttingDown) return;

    if (code === 4000) {
      console.error('[agent] another agent already active — retry in 30s');
      setTimeout(connect, DUPLICATE_AGENT_DELAY_MS);
      return;
    }

    const delay = nextBackoffMs();
    reconnectAttempt += 1;
    console.log(`[agent] disconnected, retry in ${Math.round(delay / 1000)}s`);
    setTimeout(connect, delay);
  });

  ws.on('error', (err) => {
    console.error('[agent]', err.message);
    ws.close();
  });
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[agent] ${signal} — shutting down`);
  clearTimers();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log('[agent] PC Monitor Agent v2 —', AGENT_VERSION, os.platform(), os.hostname());
connect();
