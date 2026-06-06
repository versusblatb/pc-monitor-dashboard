import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOW_REMOTE_COMMANDS,
  COMMAND_SIGNING_SECRET,
} from '../config.js';
import { verifyCommandSignature } from '../lib/command-signing.js';
import { isReplay, recordExecuted } from '../lib/executed-commands.js';
import {
  handleClearTemp,
  handleHibernate,
  handleLaunchApp,
  handleLock,
  handleRestart,
  handleScreenshot,
  handleShutdown,
  handleSleep,
  handleStopApp,
} from './handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISABLE_FILE = path.join(__dirname, '..', 'data', 'disable-remote-control');

const HANDLERS = {
  LOCK: handleLock,
  SLEEP: handleSleep,
  HIBERNATE: handleHibernate,
  SHUTDOWN: handleShutdown,
  RESTART: handleRestart,
  LAUNCH_APP: handleLaunchApp,
  STOP_APP: handleStopApp,
  CLEAR_TEMP: handleClearTemp,
  SCREENSHOT: handleScreenshot,
};

/** @param {import('ws').WebSocket} ws */
export function createCommandExecutor(ws, ctx) {
  return async function executeRemoteCommand(msg) {
    if (!ALLOW_REMOTE_COMMANDS || fs.existsSync(DISABLE_FILE)) {
      return reject(ws, msg, 'COMMANDS_DISABLED');
    }

    const command = msg?.payload?.command;
    const signature = msg?.payload?.signature;
    if (!command?.id || !command?.type) return;

    console.log('[agent] remote command received:', command.type, command.id);

    if (!verifyCommandSignature(command, signature, COMMAND_SIGNING_SECRET)) {
      ctx.onInvalidSignature?.(command.id);
      return reject(ws, { payload: { command } }, 'INVALID_SIGNATURE');
    }

    if (new Date(command.expiresAt).getTime() <= Date.now()) {
      return reject(ws, { payload: { command } }, 'EXPIRED');
    }

    const myDeviceId = typeof ctx.deviceId === 'function' ? ctx.deviceId() : ctx.deviceId;
    if (command.deviceId && myDeviceId && command.deviceId !== myDeviceId) {
      return reject(ws, { payload: { command } }, 'DEVICE_MISMATCH');
    }

    if (isReplay(command.id, command.nonce)) {
      ctx.onReplay?.(command.id);
      return reject(ws, { payload: { command } }, 'REPLAY');
    }

    const handler = HANDLERS[/** @type {keyof typeof HANDLERS} */ (command.type)];
    if (!handler) return reject(ws, { payload: { command } }, 'UNKNOWN_COMMAND');

    sendAck(ws, command.id, 'acknowledged');
    recordExecuted(command.id, command.nonce);

    try {
      sendAck(ws, command.id, 'running');
      const result = await handler(command.params ?? {});
      if (result?.errorCode) {
        sendResult(ws, command.id, 'failed', result, result.errorCode);
      } else {
        sendResult(ws, command.id, 'succeeded', result);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'execution failed';
      sendResult(ws, command.id, 'failed', { message }, 'EXECUTION_ERROR');
    }
  };
}

/** @param {import('ws').WebSocket} ws @param {string} commandId @param {string} status */
function sendAck(ws, commandId, status) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'command_ack', payload: { commandId, status } }));
}

/** @param {import('ws').WebSocket} ws @param {string} commandId @param {string} status @param {object} result @param {string} [errorCode] */
function sendResult(ws, commandId, status, result, errorCode) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({
    type: 'command_result',
    payload: {
      commandId,
      status,
      result,
      errorCode: errorCode ?? null,
      completedAt: new Date().toISOString(),
    },
  }));
}

/** @param {import('ws').WebSocket} ws @param {object} msg @param {string} errorCode */
function reject(ws, msg, errorCode) {
  const commandId = msg?.payload?.command?.id;
  if (!commandId) return;
  sendResult(ws, commandId, 'failed', { message: errorCode }, errorCode);
}
