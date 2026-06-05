export const TEMP_MIN_C = -20;
export const TEMP_MAX_C = 150;

/** @param {unknown} value */
export function parseNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} value */
export function validateUsage(value) {
  const n = parseNumber(value);
  if (n == null) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** @param {unknown} value */
export function validateTemperature(value) {
  const n = parseNumber(value);
  if (n == null) return null;
  if (n < TEMP_MIN_C || n > TEMP_MAX_C) return null;
  return Math.round(n * 10) / 10;
}

/** @param {unknown} value */
export function validatePositiveNumber(value) {
  const n = parseNumber(value);
  if (n == null || n < 0) return null;
  return n;
}
