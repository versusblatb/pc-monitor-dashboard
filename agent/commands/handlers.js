import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSafe } from './spawn-safe.js';
import { getAppById } from '../lib/apps-config.js';
import {
  ALLOW_SCREENSHOT,
  COMMAND_EXECUTION_MODE,
  SCREENSHOT_TTL_MS,
} from '../config.js';

/** @type {Map<string, number>} */
const launchedPids = new Map();

const TEMP_DIRS = [
  () => os.tmpdir(),
  () => path.join(process.env.LOCALAPPDATA || os.homedir(), 'Temp'),
  () => path.join(process.env.WINDIR || 'C:\\Windows', 'Temp'),
];

const BLOCKED_PREFIXES = [
  path.join(os.homedir(), 'Documents'),
  path.join(os.homedir(), 'Desktop'),
  path.join(os.homedir(), 'Downloads'),
].map((p) => p.toLowerCase());

const MAX_CLEAR_FILES = 5000;

export async function handleLock() {
  if (COMMAND_EXECUTION_MODE === 'mock') return { message: 'lock (mock)' };
  await spawnSafe('rundll32.exe', ['user32.dll,LockWorkStation']);
  return { message: 'workstation locked' };
}

export async function handleSleep() {
  if (COMMAND_EXECUTION_MODE === 'mock') return { message: 'sleep (mock)' };
  try {
    await spawnSafe('rundll32.exe', ['powrprof.dll,SetSuspendState', '0', '1', '0']);
    return { message: 'sleep initiated' };
  } catch {
    return { errorCode: 'UNSUPPORTED', message: 'sleep not supported' };
  }
}

export async function handleHibernate() {
  if (COMMAND_EXECUTION_MODE === 'mock') return { message: 'hibernate (mock)' };
  try {
    await spawnSafe('rundll32.exe', ['powrprof.dll,SetSuspendState', '1', '1', '0']);
    return { message: 'hibernate initiated' };
  } catch {
    return { errorCode: 'UNSUPPORTED', message: 'hibernate not supported' };
  }
}

export async function handleShutdown() {
  if (COMMAND_EXECUTION_MODE === 'mock') return { message: 'shutdown (mock)' };
  await spawnSafe('shutdown.exe', ['/s', '/t', '5', '/c', 'PC Monitor remote shutdown']);
  return { message: 'shutdown scheduled' };
}

export async function handleRestart() {
  if (COMMAND_EXECUTION_MODE === 'mock') return { message: 'restart (mock)' };
  await spawnSafe('shutdown.exe', ['/r', '/t', '5', '/c', 'PC Monitor remote restart']);
  return { message: 'restart scheduled' };
}

/** @param {{ appId?: string }} params */
export async function handleLaunchApp(params) {
  const app = getAppById(params?.appId ?? '');
  if (!app) return { errorCode: 'APP_NOT_ALLOWED', message: 'app not in whitelist' };
  if (COMMAND_EXECUTION_MODE === 'mock') return { message: `launch ${app.id} (mock)` };
  const result = await spawnSafe(app.executable, app.args, { timeoutMs: 8000 });
  if (result.code !== 0 && result.code != null) {
    return { errorCode: 'LAUNCH_FAILED', message: 'failed to launch app' };
  }
  return { message: `launched ${app.label}` };
}

/** @param {{ appId?: string }} params */
export async function handleStopApp(params) {
  const app = getAppById(params?.appId ?? '');
  if (!app || !app.allowStop) return { errorCode: 'APP_NOT_ALLOWED', message: 'stop not allowed' };
  if (COMMAND_EXECUTION_MODE === 'mock') return { message: `stop ${app.id} (mock)` };
  const exeName = path.basename(app.executable);
  await spawnSafe('taskkill.exe', ['/IM', exeName, '/F'], { timeoutMs: 8000 });
  return { message: `stopped ${app.label}` };
}

/** @param {{ phase?: string }} params */
export async function handleClearTemp(params) {
  const phase = params?.phase === 'confirm' ? 'confirm' : 'scan';
  const scan = scanTempDirs();
  if (phase === 'scan') {
    return {
      message: 'scan complete',
      files: scan.files,
      bytes: scan.bytes,
      phase: 'scan',
    };
  }
  if (COMMAND_EXECUTION_MODE === 'mock') {
    return { message: 'clear temp (mock)', deletedFiles: scan.files, freedBytes: scan.bytes };
  }
  let deleted = 0;
  let freed = 0;
  for (const entry of scan.entries.slice(0, MAX_CLEAR_FILES)) {
    try {
      const stat = fs.lstatSync(entry);
      if (stat.isSymbolicLink()) continue;
      fs.unlinkSync(entry);
      deleted += 1;
      freed += stat.size;
    } catch {
      /* skip */
    }
  }
  return { message: 'cleanup complete', deletedFiles: deleted, freedBytes: freed };
}

function scanTempDirs() {
  /** @type {string[]} */
  const entries = [];
  let bytes = 0;
  for (const dirFn of TEMP_DIRS) {
    const dir = dirFn();
    if (!dir || isBlockedPath(dir)) continue;
    walkSafe(dir, entries, 0);
  }
  for (const f of entries) {
    try {
      bytes += fs.statSync(f).size;
    } catch {
      /* ignore */
    }
  }
  return { files: entries.length, bytes, entries };
}

/** @param {string} dir @param {string[]} out @param {number} depth */
function walkSafe(dir, out, depth) {
  if (depth > 4 || out.length >= MAX_CLEAR_FILES) return;
  if (isBlockedPath(dir)) return;
  let items;
  try {
    items = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (isBlockedPath(full)) continue;
    try {
      if (item.isSymbolicLink()) continue;
      if (item.isDirectory()) walkSafe(full, out, depth + 1);
      else if (item.isFile()) out.push(full);
    } catch {
      /* skip */
    }
    if (out.length >= MAX_CLEAR_FILES) return;
  }
}

/** @param {string} p */
function isBlockedPath(p) {
  const lower = p.toLowerCase();
  return BLOCKED_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export async function handleScreenshot() {
  if (!ALLOW_SCREENSHOT) return { errorCode: 'SCREENSHOT_DISABLED', message: 'screenshot disabled' };
  if (COMMAND_EXECUTION_MODE === 'mock') {
    return { message: 'screenshot (mock)', downloadToken: 'mock-token', expiresInMs: SCREENSHOT_TTL_MS };
  }
  return { errorCode: 'SCREENSHOT_UNAVAILABLE', message: 'screenshot capture not installed in this build' };
}
