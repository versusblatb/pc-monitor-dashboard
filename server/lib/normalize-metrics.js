import { mergeMetricsState } from './merge-metrics.js';
import {
  parseNumber,
  validatePositiveNumber,
  validateTemperature,
  validateUsage,
} from './metric-validation.js';

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
  let payload = msg.payload;
  if (payload && typeof payload === 'object' && payload.payload && typeof payload.payload === 'object') {
    console.warn('[server] metrics: nested payload.payload detected, unwrapping');
    payload = payload.payload;
  }
  if (!payload || typeof payload !== 'object') return null;

  // @ts-expect-error loose
  const schemaVersion = Number(msg.schemaVersion) || Number(payload.schemaVersion) || detectSchema(payload);
  // @ts-expect-error loose
  const messageId = typeof msg.messageId === 'string' ? msg.messageId : null;
  // @ts-expect-error loose
  const timestamp = Number(msg.timestamp) || payload.ts || Date.now();

  if (schemaVersion >= 2 && isV2Payload(payload)) {
    const v2 = normalizeV2Payload(/** @type {Record<string, unknown>} */ (payload));
    return { schemaVersion: 2, messageId, timestamp, v2, legacy: v2ToLegacy(v2) };
  }

  return {
    schemaVersion: 1,
    messageId,
    timestamp,
    v2: null,
    legacy: sanitizeLegacy(/** @type {Record<string, unknown>} */ (payload)),
  };
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

/**
 * Map alternate agent field names to canonical v2 shape.
 * @param {Record<string, unknown>} raw
 */
export function normalizeV2Payload(raw) {
  const system = normalizeSystem(raw.system);
  const cpu = normalizeCpu(raw.cpu);
  const gpu = normalizeGpu(raw.gpu ?? raw.graphics);
  const memory = normalizeMemory(raw.memory ?? raw.mem);
  const network = normalizeNetwork(raw.network ?? raw.networkStats);
  const processes = normalizeProcesses(raw.processes);
  const disks = normalizeDisks(raw.disks ?? raw.fsSize);

  return {
    hostname: raw.hostname,
    agentVersion: raw.agentVersion ?? system?.agentVersion ?? null,
    schemaVersion: Number(raw.schemaVersion) || 2,
    ts: raw.ts ?? Date.now(),
    system,
    cpu,
    gpu,
    memory,
    network,
    disks,
    processes,
    uptime: numOrNull(raw.uptime),
  };
}

/** @param {unknown} sys */
function normalizeSystem(sys) {
  if (!sys || typeof sys !== 'object') return null;
  const s = /** @type {Record<string, unknown>} */ (sys);
  const osInfo = s.os && typeof s.os === 'object' ? /** @type {Record<string, unknown>} */ (s.os) : null;
  const bios = s.bios && typeof s.bios === 'object' ? /** @type {Record<string, unknown>} */ (s.bios) : null;

  return {
    manufacturer: strOrNull(s.manufacturer),
    model: strOrNull(s.model ?? s.version),
    os: strOrNull(s.os ?? (osInfo ? `${osInfo.distro ?? ''} ${osInfo.release ?? ''}`.trim() : null)),
    arch: strOrNull(s.arch ?? s.architecture),
    bios: strOrNull(s.bios ?? bios?.version),
    agentVersion: strOrNull(s.agentVersion),
    lastBoot: strOrNull(s.lastBoot),
  };
}

/** @param {unknown} cpu */
function normalizeCpu(cpu) {
  if (!cpu || typeof cpu !== 'object') return null;
  const c = /** @type {Record<string, unknown>} */ (cpu);
  return {
    usage: validateUsage(c.usage ?? c.load ?? c.currentLoad),
    temperature: validateTemperature(c.temperature ?? c.temp ?? c.main),
    model: strOrNull(c.model ?? c.brand),
    manufacturer: strOrNull(c.manufacturer),
    physicalCores: parseNumber(c.physicalCores ?? c.physical),
    logicalCores: parseNumber(c.logicalCores ?? c.cores),
    frequencyMhz: parseNumber(c.frequencyMhz ?? c.speed),
    maxSpeedMhz: parseNumber(c.maxSpeedMhz ?? c.speedMax),
  };
}

/** @param {unknown} gpu */
function normalizeGpu(gpu) {
  if (!gpu) return null;
  if (typeof gpu === 'object' && !Array.isArray(gpu)) {
    const g = /** @type {Record<string, unknown>} */ (gpu);
    if (Array.isArray(g.controllers) && g.controllers[0]) {
      return normalizeGpu(g.controllers[0]);
    }
    return {
      usage: validateUsage(g.usage ?? g.utilizationGpu),
      temperature: validateTemperature(g.temperature ?? g.temperatureGpu),
      model: strOrNull(g.model),
      vendor: strOrNull(g.vendor),
      memoryUsedMb: parseNumber(g.memoryUsedMb ?? g.memoryUsed),
      memoryTotalMb: parseNumber(g.memoryTotalMb ?? g.memoryTotal ?? g.vram),
      available: Boolean(g.available ?? g.model ?? g.usage != null),
    };
  }
  return null;
}

/** @param {unknown} mem */
function normalizeMemory(mem) {
  if (!mem || typeof mem !== 'object') return null;
  const m = /** @type {Record<string, unknown>} */ (mem);
  return {
    usedPercent: validateUsage(m.usedPercent ?? m.usedPct ?? m.percent),
    usedBytes: validatePositiveNumber(m.usedBytes ?? m.used),
    totalBytes: validatePositiveNumber(m.totalBytes ?? m.total),
    usedGb: parseNumber(m.usedGb),
    totalGb: parseNumber(m.totalGb),
  };
}

/** @param {unknown} net */
function normalizeNetwork(net) {
  if (!net) return null;
  if (Array.isArray(net)) {
    const row = net.find((n) => n && typeof n === 'object' && !n.internal) ?? net[0];
    return normalizeNetwork(row);
  }
  if (typeof net !== 'object') return null;
  const n = /** @type {Record<string, unknown>} */ (net);
  return {
    interface: strOrNull(n.interface ?? n.iface),
    ipv4: strOrNull(n.ipv4 ?? n.ip4),
    downloadBps: validatePositiveNumber(n.downloadBps ?? n.rx_sec),
    uploadBps: validatePositiveNumber(n.uploadBps ?? n.tx_sec),
    totalDownloaded: validatePositiveNumber(n.totalDownloaded ?? n.rx_bytes),
    totalUploaded: validatePositiveNumber(n.totalUploaded ?? n.tx_bytes),
    pingMs: validatePositiveNumber(n.pingMs ?? n.latency),
    type: strOrNull(n.type),
    linkSpeedMbps: validatePositiveNumber(n.linkSpeedMbps ?? n.speed),
  };
}

/** @param {unknown} proc */
function normalizeProcesses(proc) {
  if (proc == null) return null;
  if (typeof proc !== 'object') return null;
  const p = /** @type {Record<string, unknown>} */ (proc);
  const list = Array.isArray(p.list) ? p.list : null;
  const topCpu = Array.isArray(p.topCpu) ? p.topCpu : [];
  const topMemory = Array.isArray(p.topMemory) ? p.topMemory : [];

  return {
    total: parseNumber(p.total ?? p.all ?? (list ? list.length : null)),
    topCpu: topCpu.slice(0, 10),
    topMemory: topMemory.slice(0, 10),
  };
}

/** @param {unknown} disks */
function normalizeDisks(disks) {
  if (!Array.isArray(disks)) return [];
  return disks.slice(0, 32).map((d) => {
    if (!d || typeof d !== 'object') return d;
    const disk = /** @type {Record<string, unknown>} */ (d);
    return {
      ...disk,
      letter: disk.letter ?? disk.mount ?? null,
      usedPct: validateUsage(disk.usedPct ?? disk.usedPercent ?? disk.use),
      usedPercent: validateUsage(disk.usedPercent ?? disk.usedPct ?? disk.use),
      totalGb: disk.totalGb ?? (disk.size ? Math.round(Number(disk.size) / 1024 ** 3 * 10) / 10 : null),
      usedGb: disk.usedGb ?? (disk.used ? Math.round(Number(disk.used) / 1024 ** 3 * 10) / 10 : null),
    };
  });
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
    /** @type {Record<string, unknown>} */
    const client = {
      ...base,
      agentVersion: p.agentVersion ?? p.system?.agentVersion ?? null,
      uptime: p.uptime ?? base.uptime ?? null,
    };
    if (p.system) client.system = p.system;
    if (p.cpu) client.cpuInfo = p.cpu;
    if (p.gpu) client.gpuInfo = p.gpu;
    if (p.memory) client.memoryInfo = p.memory;
    if (p.network) client.network = p.network;
    if (p.processes != null) client.processes = p.processes;
    return client;
  }

  return base;
}

/**
 * @param {Record<string, unknown>|null} prev
 * @param {Record<string, unknown>} incoming
 */
export function mergeClientMetrics(prev, incoming) {
  return mergeMetricsState(prev, incoming);
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
  return validateUsage(v);
}

/** @param {unknown} v */
function numOrNull(v) {
  return parseNumber(v);
}

/** @param {unknown} v */
function strOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
