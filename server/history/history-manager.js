import { MemoryHistoryStore } from './memory-store.js';

const WRITE_INTERVAL_MS = Number(process.env.HISTORY_WRITE_INTERVAL_MS) || 10_000;
const RETENTION_DAYS = Number(process.env.HISTORY_RETENTION_DAYS) || 7;

export class HistoryManager {
  constructor() {
    this.memory = new MemoryHistoryStore({
      retentionMs: RETENTION_DAYS * 24 * 60 * 60 * 1000,
    });
    /** @type {import('./postgres-store.js').PostgresHistoryStore|null} */
    this.pg = null;
    this.lastWrite = 0;
    this.pending = null;
  }

  /** @param {import('pg').Pool} pool */
  async initPostgres(pool) {
    const { PostgresHistoryStore } = await import('./postgres-store.js');
    this.pg = new PostgresHistoryStore(pool, RETENTION_DAYS);
    setInterval(() => this.pg?.prune().catch(() => {}), 60 * 60 * 1000);
  }

  /**
   * @param {Record<string, unknown>} metrics
   * @param {string} status
   */
  onMetrics(metrics, status) {
    if (!metrics) return;
    const now = Date.now();
    if (now - this.lastWrite < WRITE_INTERVAL_MS) {
      this.pending = { metrics, status, ts: now };
      return;
    }
    this.flush(metrics, status, now);
  }

  /** @param {Record<string, unknown>} metrics @param {string} status @param {number} ts */
  flush(metrics, status, ts) {
    const point = extractHistoryPoint(metrics, status, ts);
    this.memory.append(point);
    this.pg?.append(point).catch((e) => console.error('[history] pg:', e.message));
    this.lastWrite = ts;
    this.pending = null;
  }

  flushPending() {
    if (this.pending) this.flush(this.pending.metrics, this.pending.status, this.pending.ts);
  }

  /**
   * @param {{ from: number, to: number, maxPoints?: number }} q
   */
  async query(q) {
    if (this.pg) {
      try {
        return await this.pg.query(q);
      } catch (e) {
        console.error('[history] pg query fallback:', e.message);
      }
    }
    return this.memory.query(q);
  }

  clear() {
    this.memory.clear();
  }
}

/** @param {Record<string, unknown>} m @param {string} status @param {number} ts */
function extractHistoryPoint(m, status, ts) {
  const disks = Array.isArray(m.disks) ? m.disks : [];
  const cDisk = disks.find((d) => String(d.letter ?? '').startsWith('C')) ?? disks[0];
  return {
    ts,
    hostname: m.hostname ?? 'unknown',
    cpu: m.cpu ?? null,
    gpu: m.gpu ?? null,
    ram: m.ram ?? null,
    cpuTemp: m.cpuInfo?.temperature ?? null,
    gpuTemp: m.gpuInfo?.temperature ?? null,
    downloadBps: m.network?.downloadBps ?? null,
    uploadBps: m.network?.uploadBps ?? null,
    diskSummary: cDisk
      ? { letter: cDisk.letter ?? cDisk.mount, usedPct: cDisk.usedPct ?? cDisk.usedPercent }
      : null,
    status,
  };
}
