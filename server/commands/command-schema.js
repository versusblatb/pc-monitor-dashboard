import {
  getRequiredTypedConfirmation,
  isCommandType,
} from './command-types.js';

const MAX_APP_ID_LEN = 64;
const APP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** @param {unknown} type */
export function validateCommandType(type) {
  if (!isCommandType(type)) {
    return { ok: false, error: 'INVALID_COMMAND_TYPE' };
  }
  return { ok: true, type };
}

/**
 * @param {string} type
 * @param {unknown} params
 */
export function validateCommandParams(type, params) {
  const p = params && typeof params === 'object' && !Array.isArray(params)
    ? /** @type {Record<string, unknown>} */ (params)
    : {};

  switch (type) {
    case 'LOCK':
    case 'SLEEP':
    case 'HIBERNATE':
    case 'SHUTDOWN':
    case 'RESTART':
      if (Object.keys(p).length > 0) return { ok: false, error: 'PARAMS_NOT_ALLOWED' };
      return { ok: true, params: {} };

    case 'LAUNCH_APP':
    case 'STOP_APP':
      return validateAppId(p.appId);

    case 'CLEAR_TEMP':
      return validateClearTempParams(p);

    case 'SCREENSHOT':
      if (Object.keys(p).length > 0) return { ok: false, error: 'PARAMS_NOT_ALLOWED' };
      return { ok: true, params: {} };

    default:
      return { ok: false, error: 'INVALID_COMMAND_TYPE' };
  }
}

/** @param {unknown} appId */
function validateAppId(appId) {
  if (typeof appId !== 'string' || !APP_ID_RE.test(appId) || appId.length > MAX_APP_ID_LEN) {
    return { ok: false, error: 'INVALID_APP_ID' };
  }
  return { ok: true, params: { appId } };
}

/** @param {Record<string, unknown>} p */
function validateClearTempParams(p) {
  const phase = p.phase;
  if (phase !== 'scan' && phase !== 'confirm') {
    return { ok: false, error: 'INVALID_CLEAR_TEMP_PHASE' };
  }
  return { ok: true, params: { phase } };
}

/**
 * @param {string} type
 * @param {unknown} confirmation
 */
export function validateConfirmation(type, confirmation) {
  const required = getRequiredTypedConfirmation(/** @type {import('./command-types.js').CommandType} */ (type));
  if (!required) return { ok: true };
  if (confirmation !== required) {
    return { ok: false, error: 'CONFIRMATION_MISMATCH' };
  }
  return { ok: true };
}
