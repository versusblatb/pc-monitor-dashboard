/** @typedef {'LOCK'|'UNLOCK'|'SLEEP'|'HIBERNATE'|'SHUTDOWN'|'RESTART'|'LAUNCH_APP'|'STOP_APP'|'CLEAR_TEMP'|'SCREENSHOT'} CommandType */

/** @type {readonly CommandType[]} */
export const COMMAND_TYPES = Object.freeze([
  'LOCK',
  'UNLOCK',
  'SLEEP',
  'HIBERNATE',
  'SHUTDOWN',
  'RESTART',
  'LAUNCH_APP',
  'STOP_APP',
  'CLEAR_TEMP',
  'SCREENSHOT',
]);

/** @type {Record<CommandType, number>} */
export const COMMAND_TTL_MS = Object.freeze({
  LOCK: 30_000,
  UNLOCK: 30_000,
  SLEEP: 30_000,
  HIBERNATE: 30_000,
  SHUTDOWN: 30_000,
  RESTART: 30_000,
  LAUNCH_APP: 60_000,
  STOP_APP: 60_000,
  CLEAR_TEMP: 60_000,
  SCREENSHOT: 30_000,
});

/** @type {Record<CommandType, 'safe'|'medium'|'dangerous'>} */
export const CONFIRMATION_LEVELS = Object.freeze({
  LOCK: 'safe',
  UNLOCK: 'medium',
  LAUNCH_APP: 'safe',
  SLEEP: 'medium',
  HIBERNATE: 'medium',
  STOP_APP: 'medium',
  CLEAR_TEMP: 'medium',
  RESTART: 'dangerous',
  SHUTDOWN: 'dangerous',
  SCREENSHOT: 'dangerous',
});

/** @type {Record<CommandType, CommandType|null>} */
export const TYPED_CONFIRMATIONS = Object.freeze({
  LOCK: null,
  UNLOCK: null,
  LAUNCH_APP: null,
  SLEEP: null,
  HIBERNATE: null,
  STOP_APP: null,
  CLEAR_TEMP: null,
  RESTART: 'RESTART',
  SHUTDOWN: 'SHUTDOWN',
  SCREENSHOT: 'SCREENSHOT',
});

/** @type {readonly string[]} */
export const COMMAND_STATUSES = Object.freeze([
  'pending',
  'sent',
  'acknowledged',
  'running',
  'succeeded',
  'failed',
  'expired',
  'cancelled',
  'rejected',
]);

/** @param {unknown} type */
export function isCommandType(type) {
  return typeof type === 'string' && COMMAND_TYPES.includes(/** @type {CommandType} */ (type));
}

/** @param {CommandType} type */
export function getCommandTtlMs(type) {
  return COMMAND_TTL_MS[type] ?? 30_000;
}

/** @param {CommandType} type */
export function getConfirmationLevel(type) {
  return CONFIRMATION_LEVELS[type] ?? 'dangerous';
}

/** @param {CommandType} type */
export function getRequiredTypedConfirmation(type) {
  if (type in TYPED_CONFIRMATIONS) return TYPED_CONFIRMATIONS[type];
  return type;
}
