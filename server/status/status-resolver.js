import { STATUS_CONFIG, STATUS_PRIORITY } from '../config/status-config.js';

/**
 * @typedef {'offline'|'online'|'idle'|'gaming'|'high-load'|'overheating'|'low-memory'|'low-disk-space'|'network-issue'} DeviceStatus
 */

export class StatusResolver {
  constructor(config = STATUS_CONFIG) {
    this.config = config;
    this.current = 'offline';
    this.candidate = 'offline';
    this.candidateSince = Date.now();
    this.lastChange = 0;
    this.idleSince = null;
    this.highLoadSince = null;
    this.gamingSince = null;
  }

  /**
   * @param {{ online: boolean, metrics: Record<string, unknown>|null }} input
   * @returns {{ status: DeviceStatus, changed: boolean }}
   */
  resolve({ online, metrics }) {
    const now = Date.now();
    const raw = this.computeRaw(online, metrics);
    const resolved = this.applyDebounce(raw, now);
    const changed = resolved !== this.current;
    if (changed) {
      this.current = resolved;
      this.lastChange = now;
    }
    return { status: this.current, changed };
  }

  /** @returns {DeviceStatus} */
  computeRaw(online, metrics) {
    if (!online || !metrics) return 'offline';

    const cpu = num(metrics.cpu);
    const gpu = num(metrics.gpu);
    const ram = num(metrics.ram);
    const cpuTemp = num(metrics.cpuInfo?.temperature ?? metrics.cpuDetail?.temperature);
    const gpuTemp = num(metrics.gpuInfo?.temperature ?? metrics.gpuDetail?.temperature);
    const ping = num(metrics.network?.pingMs);
    const iface = metrics.network?.interface;

    const candidates = [];

    if (cpuTemp != null && cpuTemp >= this.config.cpuTempThreshold) candidates.push('overheating');
    if (gpuTemp != null && gpuTemp >= this.config.gpuTempThreshold) candidates.push('overheating');
    if (ram != null && ram >= this.config.ramHighThreshold) candidates.push('low-memory');

    const systemDisk = findSystemDisk(metrics.disks);
    if (systemDisk) {
      const freePct = 100 - (num(systemDisk.usedPct ?? systemDisk.usedPercent) ?? 100);
      if (freePct < this.config.diskLowFreePercent) candidates.push('low-disk-space');
    }

    if (ping != null && ping >= this.config.pingHighMs) {
      candidates.push('network-issue');
    } else if (iface === null && metrics.network && metrics.network.ipv4 === null && ping === null) {
      /* network data present but all null — possible issue, lower priority than online */
      if ((cpu ?? 0) < 5 && (gpu ?? 0) < 5) candidates.push('network-issue');
    }

    if ((cpu != null && cpu >= this.config.highLoadThreshold) ||
        (gpu != null && gpu >= this.config.highLoadThreshold)) {
      this.highLoadSince ??= Date.now();
      if (Date.now() - this.highLoadSince >= this.config.highLoadMinutes * 60_000) {
        candidates.push('high-load');
      }
    } else {
      this.highLoadSince = null;
    }

    if (this.isGaming(metrics, gpu)) {
      candidates.push('gaming');
    }

    if ((cpu ?? 0) < this.config.idleCpuMax && (gpu ?? 0) < this.config.idleGpuMax) {
      this.idleSince ??= Date.now();
      if (Date.now() - this.idleSince >= this.config.idleMinutes * 60_000) {
        candidates.push('idle');
      }
    } else {
      this.idleSince = null;
    }

    candidates.push('online');

    for (const s of STATUS_PRIORITY) {
      if (candidates.includes(s)) return s;
    }
    return 'online';
  }

  /** @param {DeviceStatus} raw @param {number} now */
  applyDebounce(raw, now) {
    if (raw === 'offline') {
      this.candidate = raw;
      this.candidateSince = now;
      return raw;
    }
    if (raw !== this.candidate) {
      this.candidate = raw;
      this.candidateSince = now;
    }
    if (this.current === 'offline') return raw;
    if (now - this.candidateSince >= this.config.statusDebounceMs) return this.candidate;
    return this.current;
  }

  /** @param {Record<string, unknown>} metrics @param {number|null} gpu */
  isGaming(metrics, gpu) {
    const procs = metrics.processes?.topCpu ?? [];
    const hasGame = procs.some((p) => {
      const name = String(p.name ?? '').toLowerCase();
      return this.config.gamingProcesses.some((g) => name.includes(g));
    });
    if (hasGame) {
      this.gamingSince ??= Date.now();
      return Date.now() - this.gamingSince >= this.config.gamingMinutes * 60_000;
    }
    if (gpu != null && gpu >= this.config.gamingGpuMin) {
      this.gamingSince ??= Date.now();
      return Date.now() - this.gamingSince >= this.config.gamingMinutes * 60_000;
    }
    this.gamingSince = null;
    return false;
  }
}

/** @param {unknown} v */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} disks */
function findSystemDisk(disks) {
  if (!Array.isArray(disks)) return null;
  return disks.find((d) => String(d.letter ?? d.mount ?? '').startsWith('C')) ?? disks[0] ?? null;
}
