/** @type {import('./build-payload.js').buildPayload extends (s: infer S) => unknown ? S : never} */
export const state = {
  system: {
    manufacturer: null,
    model: null,
    os: null,
    arch: null,
    bios: null,
    agentVersion: null,
    lastBoot: null,
  },
  cpu: {
    usage: null,
    temperature: null,
    model: null,
    physicalCores: null,
    logicalCores: null,
    frequencyMhz: null,
  },
  gpu: {
    usage: null,
    temperature: null,
    model: null,
    memoryUsedMb: null,
    memoryTotalMb: null,
    available: false,
  },
  memory: {
    usedPercent: null,
    usedBytes: null,
    totalBytes: null,
    usedGb: null,
    totalGb: null,
  },
  network: {
    interface: null,
    ipv4: null,
    downloadBps: null,
    uploadBps: null,
    totalDownloaded: null,
    totalUploaded: null,
    pingMs: null,
    type: null,
    linkSpeedMbps: null,
  },
  disks: [],
  processes: null,
  uptime: null,
};

/** @param {string} key @param {unknown} value */
export function patchState(key, value) {
  if (key in state) {
    // @ts-expect-error dynamic patch
    state[key] = value;
  }
}
