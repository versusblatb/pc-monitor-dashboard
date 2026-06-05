import { randomUUID } from 'node:crypto';
import { MAX_WS_BYTES, SCHEMA_VERSION } from '../config.js';
import { validatePayloadSize } from './validate.js';

/**
 * @param {Record<string, unknown>} payload
 */
export function createMetricsMessage(payload) {
  const now = Date.now();
  const message = {
    type: 'metrics',
    schemaVersion: SCHEMA_VERSION,
    messageId: randomUUID(),
    timestamp: now,
    payload,
  };

  validatePayloadSize(message, MAX_WS_BYTES);
  return message;
}
