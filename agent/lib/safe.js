import { COLLECT_TIMEOUT_MS } from '../config.js';

/**
 * @template T
 * @param {() => Promise<T>|T} fn
 * @param {T} fallback
 * @param {string} label
 * @param {number} [timeoutMs]
 * @returns {Promise<T>}
 */
export async function safeBlock(fn, fallback, label, timeoutMs = COLLECT_TIMEOUT_MS) {
  try {
    const result = await withTimeout(Promise.resolve().then(fn), timeoutMs, label);
    return result ?? fallback;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[agent] ${label}: ${msg}`);
    return fallback;
  }
}

/**
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** @param {unknown} value */
export function numOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} value */
export function roundPct(value) {
  const n = numOrNull(value);
  if (n == null) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}
