/**
 * Merge incoming client metrics into the previous snapshot.
 * Undefined skips; null is intentional; empty fallbacks do not erase prior data.
 *
 * @param {Record<string, unknown>|null} prev
 * @param {Record<string, unknown>|null} incoming
 * @returns {Record<string, unknown>|null}
 */
export function mergeMetricsState(prev, incoming) {
  if (!incoming) return prev;
  if (!prev) return { ...incoming };

  const out = { ...prev };

  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;

    if (key === 'disks') {
      if (Array.isArray(value) && value.length > 0) out.disks = value;
      continue;
    }

    if (key === 'processes') {
      if (value === null) continue;
      if (!isPlainObject(value)) continue;
      if (isEmptyProcesses(value) && hasRealProcesses(prev.processes)) continue;
      out.processes = mergeObjectSection(
        /** @type {Record<string, unknown>} */ (prev.processes),
        value,
      );
      continue;
    }

    if (key === 'system' || key === 'cpuInfo' || key === 'gpuInfo' || key === 'memoryInfo' || key === 'network') {
      if (value === null) continue;
      if (!isPlainObject(value)) continue;
      if (isEmptyObject(value)) continue;
      out[key] = mergeObjectSection(
        /** @type {Record<string, unknown>} */ (prev[key]),
        value,
      );
      continue;
    }

    if (value === null) {
      out[key] = null;
      continue;
    }

    if (!hasMeaningfulScalar(value)) continue;
    out[key] = value;
  }

  return out;
}

/** @param {unknown} v */
function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

/** @param {unknown} v */
function hasMeaningfulScalar(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  if (Array.isArray(v)) return v.length > 0;
  if (isPlainObject(v)) return !isEmptyObject(v);
  return true;
}

/** @param {Record<string, unknown>} obj */
function isEmptyObject(obj) {
  return Object.values(obj).every((v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === ''));
}

/**
 * @param {unknown} proc
 */
function isEmptyProcesses(proc) {
  if (!isPlainObject(proc)) return true;
  const total = Number(proc.total);
  const topCpu = Array.isArray(proc.topCpu) ? proc.topCpu : [];
  const topMemory = Array.isArray(proc.topMemory) ? proc.topMemory : [];
  return (!Number.isFinite(total) || total === 0) && topCpu.length === 0 && topMemory.length === 0;
}

/**
 * @param {unknown} proc
 */
function hasRealProcesses(proc) {
  if (!isPlainObject(proc)) return false;
  const total = Number(proc.total);
  if (Number.isFinite(total) && total > 0) return true;
  const topCpu = Array.isArray(proc.topCpu) ? proc.topCpu : [];
  const topMemory = Array.isArray(proc.topMemory) ? proc.topMemory : [];
  return topCpu.length > 0 || topMemory.length > 0;
}

/**
 * @param {Record<string, unknown>|null|undefined} prev
 * @param {Record<string, unknown>} next
 */
function mergeObjectSection(prev, next) {
  const base = prev ? { ...prev } : {};
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === null) continue;
    if (!hasMeaningfulScalar(v)) continue;
    base[k] = v;
  }
  return base;
}
