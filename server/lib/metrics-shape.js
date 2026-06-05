/**
 * Safe metrics shape descriptor for debug endpoint (no secrets / paths / command lines).
 * @param {Record<string, unknown>|null} metrics
 */
export function describeMetricsShape(metrics) {
  if (!metrics) {
    return { present: false, schemaVersion: null, keys: [], sections: {} };
  }

  return {
    present: true,
    schemaVersion: metrics.schemaVersion ?? null,
    agentVersion: metrics.agentVersion ?? metrics.system?.agentVersion ?? null,
    hostname: typeof metrics.hostname === 'string' ? metrics.hostname.slice(0, 32) : null,
    ts: metrics.ts ?? null,
    keys: Object.keys(metrics).filter((k) => !k.startsWith('_')),
    sections: {
      system: shapeObject(metrics.system),
      cpuInfo: shapeObject(metrics.cpuInfo),
      gpuInfo: shapeObject(metrics.gpuInfo),
      memoryInfo: shapeObject(metrics.memoryInfo),
      network: shapeObject(metrics.network),
      processes: shapeProcesses(metrics.processes),
      disks: shapeArray(metrics.disks),
    },
  };
}

/** @param {unknown} obj */
function shapeObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { present: false, keys: [], types: {} };
  }
  /** @type {Record<string, string>} */
  const types = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase().includes('path') || k.toLowerCase().includes('command')) continue;
    types[k] = describeType(v);
  }
  return { present: true, keys: Object.keys(types), types };
}

/** @param {unknown} proc */
function shapeProcesses(proc) {
  if (!proc || typeof proc !== 'object') {
    return { present: false, total: null, topCpuCount: 0, topMemoryCount: 0 };
  }
  const p = /** @type {Record<string, unknown>} */ (proc);
  return {
    present: true,
    total: typeof p.total === 'number' ? p.total : null,
    topCpuCount: Array.isArray(p.topCpu) ? p.topCpu.length : 0,
    topMemoryCount: Array.isArray(p.topMemory) ? p.topMemory.length : 0,
    sampleKeys: Array.isArray(p.topCpu) && p.topCpu[0] ? Object.keys(p.topCpu[0]) : [],
  };
}

/** @param {unknown} arr */
function shapeArray(arr) {
  if (!Array.isArray(arr)) return { present: false, count: 0 };
  return {
    present: true,
    count: arr.length,
    sampleKeys: arr[0] && typeof arr[0] === 'object' ? Object.keys(arr[0]) : [],
  };
}

/** @param {unknown} v */
function describeType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array[${v.length}]`;
  return typeof v;
}
