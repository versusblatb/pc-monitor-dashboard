export class MemoryHistoryStore {
  /**
   * @param {{ maxPoints?: number, retentionMs?: number }} [opts]
   */
  constructor(opts = {}) {
    this.maxPoints = opts.maxPoints ?? 50_000;
    this.retentionMs = opts.retentionMs ?? 7 * 24 * 60 * 60 * 1000;
    /** @type {Array<Record<string, unknown>>} */
    this.points = [];
  }

  /** @param {Record<string, unknown>} point */
  append(point) {
    this.points.push(point);
    const cutoff = Date.now() - this.retentionMs;
    this.points = this.points.filter((p) => Number(p.ts) >= cutoff);
    if (this.points.length > this.maxPoints) {
      this.points = this.points.slice(-this.maxPoints);
    }
  }

  /**
   * @param {{ from: number, to: number, maxPoints?: number }} q
   */
  query({ from, to, maxPoints = 500 }) {
    const filtered = this.points.filter((p) => {
      const ts = Number(p.ts);
      return ts >= from && ts <= to;
    });
    return downsample(filtered, maxPoints);
  }

  clear() {
    this.points = [];
  }

  get size() {
    return this.points.length;
  }
}

/**
 * @param {Array<Record<string, unknown>>} data
 * @param {number} max
 */
export function downsample(data, max) {
  if (data.length <= max) return data;
  const step = Math.ceil(data.length / max);
  const out = [];
  for (let i = 0; i < data.length; i += step) out.push(data[i]);
  if (out[out.length - 1] !== data[data.length - 1]) {
    out.push(data[data.length - 1]);
  }
  return out;
}
