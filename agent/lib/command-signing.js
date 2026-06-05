import { createHmac, timingSafeEqual } from 'node:crypto';

/** @param {unknown} obj */
function sortKeys(value) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return value;
  const sorted = {};
  for (const key of Object.keys(/** @type {Record<string, unknown>} */ (value)).sort()) {
    sorted[key] = sortKeys(/** @type {Record<string, unknown>} */ (value)[key]);
  }
  return sorted;
}

/** @param {unknown} obj */
function canonicalJson(obj) {
  return JSON.stringify(sortKeys(obj ?? {}));
}

/** @param {object} command @param {string} secret */
export function verifyCommandSignature(command, signature, secret) {
  if (!secret || !signature) return false;
  const payload = [
    command.id,
    command.deviceId,
    command.type,
    canonicalJson(command.params ?? {}),
    command.createdAt,
    command.expiresAt,
    command.nonce,
    command.version ?? 1,
  ].join('|');
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
