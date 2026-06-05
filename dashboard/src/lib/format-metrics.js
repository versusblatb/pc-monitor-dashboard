/** @param {unknown} value */
function finiteNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} value */
export function formatTemperature(value) {
  const number = finiteNumber(value);
  if (number == null) return '—';
  return `${number.toFixed(1)} °C`;
}

/** @param {unknown} value */
export function formatPercent(value) {
  const number = finiteNumber(value);
  if (number == null) return '—';
  return `${Math.round(number)}%`;
}

/** @param {unknown} value */
export function formatUsage(value) {
  return formatPercent(value);
}

/**
 * @param {unknown} mhz Megahertz
 */
export function formatFrequency(mhz) {
  const number = finiteNumber(mhz);
  if (number == null) return '—';
  if (number >= 1000) return `${(number / 1000).toFixed(2)} GHz`;
  return `${Math.round(number)} MHz`;
}

/** @param {unknown} bps Bytes per second */
export function formatNetworkSpeed(bps) {
  const number = finiteNumber(bps);
  if (number == null) return '—';
  if (number < 1024) return `${Math.round(number)} B/s`;
  if (number < 1024 ** 2) return `${(number / 1024).toFixed(1)} KB/s`;
  if (number < 1024 ** 3) return `${(number / 1024 ** 2).toFixed(1)} MB/s`;
  return `${(number / 1024 ** 3).toFixed(1)} GB/s`;
}

/** @param {unknown} value */
export function formatDiskPercent(value) {
  return formatPercent(value);
}

/**
 * Primary temperature: CPU first, then GPU.
 * @param {unknown} cpuTemp
 * @param {unknown} gpuTemp
 */
export function formatPrimaryTemperature(cpuTemp, gpuTemp) {
  const cpu = finiteNumber(cpuTemp);
  if (cpu != null) return formatTemperature(cpu);
  const gpu = finiteNumber(gpuTemp);
  if (gpu != null) return formatTemperature(gpu);
  return '—';
}

/**
 * @param {unknown} cpuTemp
 * @param {unknown} gpuTemp
 */
export function formatTemperatureSubtitle(cpuTemp, gpuTemp) {
  return `CPU ${formatTemperature(cpuTemp)} · GPU ${formatTemperature(gpuTemp)}`;
}
