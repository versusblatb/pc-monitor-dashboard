import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * @param {string|Buffer} a
 * @param {string|Buffer} b
 */
export function constantTimeEqual(a, b) {
  const bufA = Buffer.isBuffer(a) ? a : Buffer.from(String(a), 'utf8');
  const bufB = Buffer.isBuffer(b) ? b : Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** @param {string|null|undefined} value */
export function hashSensitive(value) {
  if (!value) return null;
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

/** @param {unknown} obj */
export function canonicalJson(obj) {
  return JSON.stringify(sortKeys(obj ?? {}));
}

/** @param {unknown} value */
function sortKeys(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return value;
  const sorted = {};
  for (const key of Object.keys(/** @type {Record<string, unknown>} */ (value)).sort()) {
    sorted[key] = sortKeys(/** @type {Record<string, unknown>} */ (value)[key]);
  }
  return sorted;
}
