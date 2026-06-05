import si from 'systeminformation';
import { getDisksWindows } from '../metrics.js';
import { safeBlock, numOrNull, roundPct } from '../lib/safe.js';

const EMPTY_NETWORK = {
  interface: null,
  ipv4: null,
  downloadBps: null,
  uploadBps: null,
  totalDownloaded: null,
  totalUploaded: null,
  pingMs: null,
  type: null,
  linkSpeedMbps: null,
};

/** @returns {Promise<typeof EMPTY_NETWORK>} */
export async function collectNetwork() {
  return safeBlock(
    async () => {
      const [stats, ifaces, def, ping] = await Promise.all([
        si.networkStats().catch(() => []),
        si.networkInterfaces().catch(() => []),
        si.networkInterfaceDefault().catch(() => null),
        si.inetLatency().catch(() => null),
      ]);

      const defaultName = def || null;
      const activeStat =
        (Array.isArray(stats) ? stats : []).find((s) => s.iface === defaultName) ||
        (Array.isArray(stats) ? stats.find((s) => !s.iface?.toLowerCase().includes('loopback')) : null);

      const activeIface = (Array.isArray(ifaces) ? ifaces : [])
        .flat()
        .find((i) => i.iface === defaultName && i.ip4 && !i.internal);

      const pingMs = numOrNull(ping);

      return {
        interface: defaultName,
        ipv4: activeIface?.ip4 || null,
        downloadBps: numOrNull(activeStat?.rx_sec),
        uploadBps: numOrNull(activeStat?.tx_sec),
        totalDownloaded: numOrNull(activeStat?.rx_bytes),
        totalUploaded: numOrNull(activeStat?.tx_bytes),
        pingMs,
        type: activeIface?.type || null,
        linkSpeedMbps: numOrNull(activeIface?.speed),
      };
    },
    { ...EMPTY_NETWORK },
    'network',
    5000,
  );
}

/** @returns {Promise<Array<Record<string, unknown>>>} */
export async function collectDisks() {
  return safeBlock(
    async () => {
      if (process.platform === 'win32') {
        const legacy = getDisksWindows();
        if (legacy.length) {
          return legacy.map(mapLegacyDisk);
        }
      }

      const fs = await si.fsSize();
      if (!Array.isArray(fs)) return [];

      return fs.map((d) => ({
        mount: d.mount || null,
        letter: d.mount?.endsWith(':') ? d.mount : d.mount || null,
        filesystem: d.fs || d.type || null,
        type: d.type || 'disk',
        totalBytes: numOrNull(d.size),
        usedBytes: numOrNull(d.used),
        freeBytes: numOrNull(d.available),
        usedPercent: roundPct(d.use),
        totalGb: d.size ? Math.round((d.size / 1024 ** 3) * 10) / 10 : null,
        usedGb: d.used ? Math.round((d.used / 1024 ** 3) * 10) / 10 : null,
        readBps: null,
        writeBps: null,
        loadPct: null,
        smartStatus: null,
        // legacy compat fields
        usedPct: roundPct(d.use),
      }));
    },
    process.platform === 'win32' ? getDisksWindows().map(mapLegacyDisk) : [],
    'disks',
    6000,
  );
}

/** @param {Record<string, unknown>} d */
function mapLegacyDisk(d) {
  return {
    mount: d.letter || null,
    letter: d.letter || null,
    filesystem: null,
    type: d.type || 'disk',
    totalBytes: d.totalGb ? Math.round(Number(d.totalGb) * 1024 ** 3) : null,
    usedBytes: d.usedGb ? Math.round(Number(d.usedGb) * 1024 ** 3) : null,
    freeBytes: null,
    usedPercent: d.usedPct ?? null,
    totalGb: d.totalGb ?? null,
    usedGb: d.usedGb ?? null,
    readBps: null,
    writeBps: null,
    loadPct: d.loadPct ?? null,
    smartStatus: null,
    usedPct: d.usedPct ?? null,
  };
}
