import fs from 'node:fs';
import path from 'node:path';
import { APPS_CONFIG_PATH } from '../config.js';

const BLOCKED_EXT = /\.(bat|cmd|ps1|js|vbs)$/i;
const APP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** @type {Map<string, object>} */
let appsById = new Map();

export function loadAppsConfig() {
  appsById = new Map();
  try {
    const raw = fs.readFileSync(path.resolve(APPS_CONFIG_PATH), 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.apps) ? parsed.apps : [];
    for (const app of list) {
      if (!app?.id || !APP_ID_RE.test(app.id)) continue;
      const exe = String(app.executable ?? '');
      if (!isSafeExecutable(exe)) continue;
      appsById.set(app.id, {
        id: app.id,
        label: String(app.label ?? app.id),
        executable: exe,
        args: Array.isArray(app.args) ? app.args.map(String) : [],
        allowStop: Boolean(app.allowStop),
      });
    }
  } catch {
    appsById = new Map();
  }
  return appsById;
}

/** @param {string} exe */
function isSafeExecutable(exe) {
  if (!exe || !path.isAbsolute(exe)) return false;
  if (exe.startsWith('\\\\')) return false;
  if (BLOCKED_EXT.test(exe)) return false;
  return exe.toLowerCase().endsWith('.exe');
}

export function getPublicAppsList() {
  return [...appsById.values()].map((a) => ({ id: a.id, label: a.label, allowStop: a.allowStop }));
}

/** @param {string} appId */
export function getAppById(appId) {
  return appsById.get(appId) ?? null;
}

/** @param {object[]} apps */
export function replaceAppsConfig(apps) {
  const next = [];
  for (const app of apps) {
    if (!app?.id || !APP_ID_RE.test(app.id)) continue;
    const exe = String(app.executable ?? '');
    if (!isSafeExecutable(exe)) continue;
    next.push({
      id: app.id,
      label: String(app.label ?? app.id),
      executable: exe,
      args: Array.isArray(app.args) ? app.args.map(String) : [],
      allowStop: Boolean(app.allowStop),
    });
  }
  appsById = new Map(next.map((a) => [a.id, a]));
  try {
    fs.mkdirSync(path.dirname(path.resolve(APPS_CONFIG_PATH)), { recursive: true });
    fs.writeFileSync(path.resolve(APPS_CONFIG_PATH), JSON.stringify({ apps: next }, null, 2), 'utf8');
  } catch (err) {
    console.warn('[agent] failed to persist apps.json:', err instanceof Error ? err.message : err);
  }
  return getPublicAppsList();
}

loadAppsConfig();
