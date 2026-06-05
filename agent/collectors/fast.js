import os from 'node:os';
import si from 'systeminformation';
import { getCpuPercent, getGpuInfo, getRamStats, warmupCpuBaseline } from '../metrics.js';
import { getCpuOsInfo } from '../lib/os-fallbacks.js';
import { safeBlock, numOrNull, roundPct } from '../lib/safe.js';

const CPU_OS = getCpuOsInfo();

const EMPTY_CPU = {
  usage: null,
  temperature: null,
  model: null,
  physicalCores: null,
  logicalCores: null,
  frequencyMhz: null,
};

const EMPTY_GPU = {
  usage: null,
  temperature: null,
  model: null,
  memoryUsedMb: null,
  memoryTotalMb: null,
  available: false,
};

const EMPTY_MEMORY = {
  usedPercent: null,
  usedBytes: null,
  totalBytes: null,
  usedGb: null,
  totalGb: null,
};

export { warmupCpuBaseline };

/** @param {Record<string, unknown>} partial */
function mergeCpuStatic(partial) {
  return {
    ...EMPTY_CPU,
    ...CPU_OS,
    ...partial,
    model: partial.model ?? CPU_OS.model,
    physicalCores: partial.physicalCores ?? CPU_OS.physicalCores,
    logicalCores: partial.logicalCores ?? CPU_OS.logicalCores,
    frequencyMhz: partial.frequencyMhz ?? CPU_OS.frequencyMhz,
  };
}

/** @returns {Promise<typeof EMPTY_CPU>} */
export async function collectCpu() {
  return safeBlock(
    async () => {
      const [load, temp, cpu] = await Promise.all([
        si.currentLoad().catch(() => null),
        si.cpuTemperature().catch(() => null),
        si.cpu().catch(() => null),
      ]);

      const legacy = getCpuPercent();
      const usage = roundPct(load?.currentLoad) ?? legacy;
      const temps = temp?.main != null ? temp.main : temp?.max;
      const freq = cpu?.speed != null ? Math.round(cpu.speed * 1000) : CPU_OS.frequencyMhz;

      return mergeCpuStatic({
        usage,
        temperature: numOrNull(temps),
        model: cpu?.brand || CPU_OS.model,
        physicalCores: numOrNull(cpu?.physicalCores) ?? CPU_OS.physicalCores,
        logicalCores: numOrNull(cpu?.cores) ?? CPU_OS.logicalCores,
        frequencyMhz: freq,
      });
    },
    mergeCpuStatic({ usage: getCpuPercent() }),
    'cpu',
    10000,
  );
}

/** @returns {Promise<typeof EMPTY_GPU>} */
export async function collectGpu() {
  return safeBlock(
    async () => {
      const legacy = getGpuInfo();
      let graphics = null;
      try {
        graphics = await si.graphics();
      } catch {
        /* fallback legacy */
      }

      const controller = graphics?.controllers?.[0];
      const usage =
        roundPct(controller?.utilizationGpu) ??
        roundPct(legacy.gpu) ??
        (legacy.gpuAvailable ? legacy.gpu : null);

      const temp = numOrNull(controller?.temperatureGpu);
      const model =
        controller?.model?.replace('NVIDIA ', '').replace('GeForce ', '') ||
        legacy.gpuName ||
        null;

      const memUsed = numOrNull(controller?.memoryUsed);
      const memTotal = numOrNull(controller?.memoryTotal ?? controller?.vram);

      return {
        usage,
        temperature: temp,
        model,
        memoryUsedMb: memUsed,
        memoryTotalMb: memTotal,
        available: Boolean(legacy.gpuAvailable || usage != null || model),
      };
    },
    {
      usage: getGpuInfo().gpu,
      temperature: null,
      model: getGpuInfo().gpuName,
      memoryUsedMb: null,
      memoryTotalMb: null,
      available: getGpuInfo().gpuAvailable,
    },
    'gpu',
    10000,
  );
}

/** @returns {Promise<typeof EMPTY_MEMORY>} */
export async function collectMemory() {
  return safeBlock(
    async () => {
      const legacy = getRamStats();
      let mem = null;
      try {
        mem = await si.mem();
      } catch {
        /* use legacy */
      }

      const total = numOrNull(mem?.total) ?? Math.round(legacy.ramTotalGb * 1024 ** 3);
      const used = numOrNull(mem?.used) ?? Math.round(legacy.ramUsedGb * 1024 ** 3);
      const usedPercent = roundPct((mem?.used / mem?.total) * 100) ?? legacy.ram;

      return {
        usedPercent,
        usedBytes: used,
        totalBytes: total,
        usedGb: legacy.ramUsedGb,
        totalGb: legacy.ramTotalGb,
      };
    },
    {
      usedPercent: getRamStats().ram,
      usedBytes: null,
      totalBytes: null,
      usedGb: getRamStats().ramUsedGb,
      totalGb: getRamStats().ramTotalGb,
    },
    'memory',
    8000,
  );
}

/** @returns {Promise<number|null>} */
export async function collectUptime() {
  return safeBlock(
    async () => {
      const t = await si.time();
      return numOrNull(t?.uptime) ?? numOrNull(os.uptime());
    },
    numOrNull(os.uptime()),
    'uptime',
    3000,
  );
}
