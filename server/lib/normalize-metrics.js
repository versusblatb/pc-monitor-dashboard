const MAX_HOSTNAME_LEN = 64;
const MAX_WS_BYTES = 128 * 1024;

/**
 * @param {unknown} msg
 */
export function normalizeAgentMessage(msg) {
  if (!msg || typeof msg !== 'object') return null;
  // @ts-expect-error loose
  if (msg.type !== 'metrics') return null;
  // @ts-expect-error loose
  const payload = msg.payload;
  if (!payload || typeof payload !== 'object') return null;

  // @ts-expect-error loose
  const schemaVersion = Number(msg.schemaVersion) || detectSchema(payload);
  // @ts-expect-error loose
  const messageId = typeof msg.messageId === 'string' ? msg.messageId : null;
  // @ts-expect-error loose
  const timestamp = Number(msg.timestamp) || payload.ts || Date.now();

  if (schemaVersion >= 2 && isV2Payload(payload)) {
    return { schemaVersion: 2, messageId, timestamp, v2: payload, legacy: v2ToLegacy(payload) };
  }

  return { schemaVersion: 1, messageId, timestamp, v2: null, legacy: sanitizeLegacy(payload) };
}

/** @param {Record<string, unknown>} payload */
function detectSchema(payload) {
  return payload.cpu && typeof payload.cpu === 'object' ? 2 : 1;
}

/** @param {Record<string, unknown>} payload */
function isV2Payload(payload) {
  return (
    (payload.cpu && typeof payload.cpu === 'object') ||
    (payload.memory && typeof payload.memory === 'object') ||
    (payload.system && typeof payload.system === 'object')
  );
}

/** @param {Record<string, unknown>} p */
function v2ToLegacy(p) {
  const cpu = /** @type {{ usage?: number }} */ (p.cpu);
  const gpu = /** @type {{ usage?: number, model?: string, available?: boolean }} */ (p.gpu);
  const mem = /** @type {{ usedPercent?: number, usedGb?: number, totalGb?: number }} */ (p.memory);

  return sanitizeLegacy({
    hostname: p.hostname,
    ts: p.ts ?? Date.now(),
    cpu: cpu?.usage ?? null,
    gpu: gpu?.usage ?? null,
    gpuName: gpu?.model ?? 'GPU',
    gpuAvailable: Boolean(gpu?.available),
    ram: mem?.usedPercent ?? null,
    ramUsedGb: mem?.usedGb ?? null,
    ramTotalGb: mem?.totalGb ?? null,
    disks: Array.isArray(p.disks) ? p.disks : [],
    uptime: p.uptime ?? null,
  });
}

/** @param {Record<string, unknown>} raw */
function sanitizeLegacy(raw) {
  const hostname = String(raw.hostname ?? 'unknown')
    .replace(/[^\w.\-]/g, '')
    .slice(0, MAX_HOSTNAME_LEN);

  return {
    hostname: hostname || 'unknown',
    ts: Number(raw.ts) || Date.now(),
    cpu: clampPct(raw.cpu),
    gpu: clampPct(raw.gpu),
    gpuName: String(raw.gpuName ?? 'GPU').slice(0, 64),
    gpuAvailable: Boolean(raw.gpuAvailable),
    ram: clampPct(raw.ram),
    ramUsedGb: numOrNull(raw.ramUsedGb),
    ramTotalGb: numOrNull(raw.ramTotalGb),
    disks: Array.isArray(raw.disks) ? raw.disks.slice(0, 32) : [],
    uptime: numOrNull(raw.uptime),
  };
}

/** @param {{ schemaVersion: number, messageId: string|null, timestamp: number, v2: Record<string, unknown>|null, legacy: Record<string, unknown> }} normalized */
export function toClientPayload(normalized) {
  const base = { ...normalized.legacy, schemaVersion: normalized.schemaVersion };

  if (normalized.schemaVersion >= 2 && normalized.v2) {
    const p = normalized.v2;
    return {
      ...base,
      system: p.system ?? null,
      cpuInfo: p.cpu ?? null,
      gpuInfo: p.gpu ?? null,
      memoryInfo: p.memory ?? null,
      network: p.network ?? null,
      processes: p.processes ?? null,
      uptime: p.uptime ?? base.uptime ?? null,
    };
  }

  return base;
}

/** @param {unknown} raw */
export function validateIncomingSize(raw) {
  const bytes = Buffer.byteLength(String(raw), 'utf8');
  if (bytes > MAX_WS_BYTES) {
    throw new Error(`message too large: ${bytes} bytes`);
  }
}

/** @param {unknown} v */
function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** @param {unknown} v */
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
