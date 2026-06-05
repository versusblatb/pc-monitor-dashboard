import { WebSocket } from 'ws';
import os from 'node:os';
import {
  AGENT_VERSION,
  DUPLICATE_AGENT_DELAY_MS,
  FAST_INTERVAL_MS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_MS,
  SCHEMA_VERSION,
  SERVER_URL,
} from './config.js';
import { buildPayload } from './build-payload.js';
import { withCollectorLock } from './lib/collector-lock.js';
import { getCpuOsInfo, getNetworkOsInfo } from './lib/os-fallbacks.js';
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
import { buildAgentAuthMessage } from './lib/auth.js';
import { createCommandExecutor } from './commands/executor.js';

/** @type {ReturnType<typeof setInterval>[]} */
const timers = [];
let reconnectAttempt = 0;
let shuttingDown = false;
let connectDiagLogged = false;
let schedulerTick = 0;
let authenticated = false;
/** @type {string|null} */
let deviceId = null;

function clearTimers() {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
  schedulerTick = 0;
}

function nextBackoffMs() {
  const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempt);
  const jitter = Math.random() * 0.25 * exp;
  return Math.round(exp + jitter);
}

function seedCpuBaseline() {
  const cpuOs = getCpuOsInfo();
  patchState('cpu', { ...state.cpu, ...cpuOs });
}

function seedNetworkBaseline() {
  const osNet = getNetworkOsInfo();
  if (!osNet) return;
  patchState('network', {
    ...state.network,
    interface: osNet.interface,
    ipv4: osNet.ipv4,
    type: osNet.type,
  });
}

async function refreshStatic() {
  return withCollectorLock(async () => {
    patchState('system', await collectStatic());
  });
}

async function refreshFast() {
  return withCollectorLock(async () => {
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
  });
}

async function refreshMedium() {
  return withCollectorLock(async () => {
    const [network, disks] = await Promise.allSettled([collectNetwork(), collectDisks()]);
    if (network.status === 'fulfilled') patchState('network', network.value);
    if (disks.status === 'fulfilled') patchState('disks', disks.value);
  });
}

async function refreshSlow() {
  return withCollectorLock(async () => {
    const processes = await collectProcesses();
    if (processes) patchState('processes', processes);
  });
}

async function bootstrapCollectors() {
  seedCpuBaseline();
  seedNetworkBaseline();
  await refreshStatic().catch(() => {});
  await refreshFast().catch(() => {});
  await refreshMedium().catch(() => {});
  await refreshSlow().catch(() => {});
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
      deviceId,
      authenticated,
      hasSystem: Boolean(state.system && Object.values(state.system).some((v) => v != null && v !== '')),
      hasCpu: state.cpu?.usage != null || state.cpu?.model != null,
      cpuCores: state.cpu?.physicalCores,
      cpuFreq: state.cpu?.frequencyMhz,
      hasGpu: state.gpu?.available || state.gpu?.model != null || state.gpu?.usage != null,
      disks: Array.isArray(state.disks) ? state.disks.length : 0,
      processTotal: procs?.total ?? null,
      topCpu: procs?.topCpu?.length ?? 0,
      topMemory: procs?.topMemory?.length ?? 0,
      hasNetwork: Boolean(state.network?.interface || state.network?.ipv4),
      networkIface: state.network?.interface,
      payloadBytes: bytes,
      wsReady: ws.readyState === 1,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent] connect diagnostics failed:', msg);
  }
}

function sendMetrics(ws) {
  if (ws.readyState !== 1 || !authenticated) return;
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
  seedCpuBaseline();
  seedNetworkBaseline();

  refreshStatic().catch(() => {});
  refreshFast().catch(() => {});
  refreshMedium().catch(() => {});
  refreshSlow().catch(() => {});

  timers.push(
    setInterval(() => {
      sendMetrics(ws);
      schedulerTick += 1;

      if (schedulerTick % 2 === 0) refreshFast().catch(() => {});
      if (schedulerTick % 3 === 0) refreshMedium().catch(() => {});
      if (schedulerTick % 6 === 0) refreshSlow().catch(() => {});
      if (schedulerTick % 3600 === 0) refreshStatic().catch(() => {});
    }, FAST_INTERVAL_MS),
  );
}

function connect() {
  if (shuttingDown) return;

  const ws = new WebSocket(SERVER_URL);
  authenticated = false;
  deviceId = null;

  const executeCommand = createCommandExecutor(ws, {
    deviceId: () => deviceId,
    onInvalidSignature: (id) => console.warn('[agent] invalid command signature:', id),
    onReplay: (id) => console.warn('[agent] replay rejected:', id),
  });

  ws.on('open', () => {
    reconnectAttempt = 0;
    connectDiagLogged = false;
    console.log('[agent] connected to', SERVER_URL);
    ws.send(JSON.stringify(buildAgentAuthMessage()));
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'agent_auth_result') {
        if (msg.payload?.ok) {
          authenticated = true;
          deviceId = msg.payload.deviceId ?? null;
          console.log('[agent] authenticated, deviceId:', deviceId);
          sendMetrics(ws);
          startCollectors(ws);
          bootstrapCollectors()
            .then(() => {
              logConnectDiagnostics(ws);
              sendMetrics(ws);
            })
            .catch(() => {});
        } else {
          console.error('[agent] authentication failed');
          ws.close();
        }
        return;
      }
      if (msg.type === 'remote_command') {
        await executeCommand(msg);
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[agent] message error:', message);
    }
  });

  ws.on('close', (code) => {
    clearTimers();
    authenticated = false;
    if (shuttingDown) return;

    if (code === 4000) {
      if (!shuttingDown) {
        console.error('[agent] another agent already active — stop other agents, retry in 30s');
        setTimeout(connect, DUPLICATE_AGENT_DELAY_MS);
      }
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
