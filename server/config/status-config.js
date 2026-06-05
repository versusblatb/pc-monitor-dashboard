export const STATUS_CONFIG = {
  offlineTimeoutMs: Number(process.env.OFFLINE_TIMEOUT_MS) || 12_000,
  idleCpuMax: Number(process.env.IDLE_CPU_MAX) || 15,
  idleGpuMax: Number(process.env.IDLE_GPU_MAX) || 15,
  idleMinutes: Number(process.env.IDLE_MINUTES) || 3,
  gamingGpuMin: Number(process.env.GAMING_GPU_MIN) || 45,
  gamingMinutes: Number(process.env.GAMING_MINUTES) || 2,
  highLoadThreshold: Number(process.env.HIGH_LOAD_THRESHOLD) || 85,
  highLoadMinutes: Number(process.env.HIGH_LOAD_MINUTES) || 2,
  cpuTempThreshold: Number(process.env.CPU_TEMP_THRESHOLD) || 85,
  gpuTempThreshold: Number(process.env.GPU_TEMP_THRESHOLD) || 85,
  ramHighThreshold: Number(process.env.RAM_HIGH_THRESHOLD) || 90,
  diskLowFreePercent: Number(process.env.DISK_LOW_FREE_PERCENT) || 10,
  pingHighMs: Number(process.env.PING_HIGH_MS) || 200,
  statusDebounceMs: Number(process.env.STATUS_DEBOUNCE_MS) || 30_000,
  gamingProcesses: (process.env.GAMING_PROCESSES ||
    'steam.exe,epicgameslauncher.exe,battle.net.exe,league of legends,valorant,cs2,dota2,gta5,fortnite')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
};

export const STATUS_PRIORITY = [
  'offline',
  'overheating',
  'low-memory',
  'low-disk-space',
  'network-issue',
  'high-load',
  'gaming',
  'idle',
  'online',
];
