import { MAX_PROCESS_NAME_LEN, TOP_PROCESSES } from '../config.js';

/**
 * @param {unknown} message
 * @param {number} maxBytes
 */
export function validatePayloadSize(message, maxBytes) {
  const json = JSON.stringify(message);
  if (Buffer.byteLength(json, 'utf8') > maxBytes) {
    throw new Error(`metrics payload exceeds ${maxBytes} bytes`);
  }
}

/** @param {string} name */
export function sanitizeProcessName(name) {
  if (!name || typeof name !== 'string') return 'unknown';
  let clean = name.replace(/\\/g, '/').split('/').pop() || name;
  clean = clean.replace(/[^\w\s.\-()+]/g, '').trim();
  if (!clean) clean = 'unknown';
  return clean.slice(0, MAX_PROCESS_NAME_LEN);
}

/**
 * @param {Array<Record<string, unknown>>|null|undefined} list
 * @param {'cpu'|'mem'} sortBy
 */
export function sanitizeProcessList(list, sortBy) {
  if (!Array.isArray(list)) {
    return { total: 0, topCpu: [], topMemory: [] };
  }

  const mapped = list
    .filter((p) => p && typeof p.name === 'string' && Number.isFinite(Number(p.pid)))
    .map((p) => ({
      name: sanitizeProcessName(String(p.name)),
      pid: Number(p.pid),
      cpu: roundOrNull(p.cpu ?? p.pcpu),
      memoryBytes: numOrNull(p.mem ?? p.memory ?? p.rss),
      memoryPercent: roundOrNull(p.memPercent ?? p.pmem),
    }));

  const topCpu = [...mapped]
    .sort((a, b) => (b.cpu ?? 0) - (a.cpu ?? 0))
    .slice(0, TOP_PROCESSES);

  const topMemory = [...mapped]
    .sort((a, b) => (b.memoryBytes ?? 0) - (a.memoryBytes ?? 0))
    .slice(0, TOP_PROCESSES);

  return {
    total: list.length,
    topCpu: sortBy === 'cpu' ? topCpu : topCpu,
    topMemory,
  };
}

/** @param {unknown} v */
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} v */
function roundOrNull(v) {
  const n = numOrNull(v);
  return n == null ? null : Math.min(100, Math.max(0, Math.round(n)));
}

/** @param {string} hostname */
export function sanitizeHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return 'unknown';
  return hostname.replace(/[^\w.\-]/g, '').slice(0, 64) || 'unknown';
}
