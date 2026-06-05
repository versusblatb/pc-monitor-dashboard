import { createHmac } from 'node:crypto';
import { canonicalJson, constantTimeEqual } from './crypto-utils.js';

/**
 * @param {object} command
 * @param {string} secret
 */
export function signCommand(command, secret) {
  const payload = buildSignPayload(command);
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * @param {object} command
 * @param {string} signature
 * @param {string} secret
 */
export function verifyCommandSignature(command, signature, secret) {
  if (!secret || !signature) return false;
  const expected = signCommand(command, secret);
  return constantTimeEqual(expected, signature);
}

/** @param {object} command */
function buildSignPayload(command) {
  return [
    command.id,
    command.deviceId,
    command.type,
    canonicalJson(command.params ?? {}),
    command.createdAt,
    command.expiresAt,
    command.nonce,
    command.version ?? 1,
  ].join('|');
}
