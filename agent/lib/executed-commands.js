import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'executed-commands.json');
const MAX_ENTRIES = 500;

/** @type {{ ids: string[], nonces: string[] }} */
let cache = { ids: [], nonces: [] };

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadExecutedCommands() {
  try {
    ensureDir();
    if (!fs.existsSync(FILE_PATH)) return;
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.ids) && Array.isArray(parsed.nonces)) {
      cache = {
        ids: parsed.ids.slice(-MAX_ENTRIES),
        nonces: parsed.nonces.slice(-MAX_ENTRIES),
      };
    }
  } catch {
    cache = { ids: [], nonces: [] };
  }
}

function persist() {
  try {
    ensureDir();
    const tmp = `${FILE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cache), 'utf8');
    fs.renameSync(tmp, FILE_PATH);
  } catch {
    /* ignore corrupt writes */
  }
}

/** @param {string} id @param {string} nonce */
export function isReplay(id, nonce) {
  return cache.ids.includes(id) || cache.nonces.includes(nonce);
}

/** @param {string} id @param {string} nonce */
export function recordExecuted(id, nonce) {
  if (!cache.ids.includes(id)) cache.ids.push(id);
  if (!cache.nonces.includes(nonce)) cache.nonces.push(nonce);
  if (cache.ids.length > MAX_ENTRIES) cache.ids = cache.ids.slice(-MAX_ENTRIES);
  if (cache.nonces.length > MAX_ENTRIES) cache.nonces = cache.nonces.slice(-MAX_ENTRIES);
  persist();
}

loadExecutedCommands();
