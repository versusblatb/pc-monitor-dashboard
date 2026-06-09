import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { validateCommandParams, validateCommandType, validateConfirmation } from '../commands/command-schema.js';
import { signCommand, verifyCommandSignature } from '../commands/command-signing.js';
import { CommandManager } from '../commands/command-manager.js';
import { hashCommandPassword, verifyCommandPassword } from '../commands/password-hash.js';
import { isCommandsAvailable } from '../commands/commands-config.js';
import { isReplay, recordExecuted, loadExecutedCommands } from '../../agent/lib/executed-commands.js';
import { verifyCommandSignature as agentVerify } from '../../agent/lib/command-signing.js';

const SECRET = 'test-signing-secret-32chars-minimum!!';
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function baseCommand(overrides = {}) {
  const now = Date.now();
  return {
    id: randomUUID(),
    deviceId: 'device-1',
    type: 'LOCK',
    params: {},
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30_000).toISOString(),
    nonce: randomBytes(16).toString('hex'),
    version: 1,
    ...overrides,
  };
}

describe('command schema', () => {
  it('rejects unknown command type', () => {
    assert.equal(validateCommandType('RUN_SHELL').ok, false);
  });

  it('rejects invalid LAUNCH_APP params', () => {
    assert.equal(validateCommandParams('LAUNCH_APP', { appId: '../evil' }).ok, false);
    assert.equal(validateCommandParams('LAUNCH_APP', { executable: 'C:\\evil.bat' }).ok, false);
  });

  it('rejects arbitrary args for power commands', () => {
    assert.equal(validateCommandParams('RESTART', { cmd: 'format c:' }).ok, false);
  });

  it('rejects dangerous confirmation mismatch', () => {
    assert.equal(validateConfirmation('RESTART', 'SHUTDOWN').ok, false);
    assert.equal(validateConfirmation('RESTART', 'RESTART').ok, true);
  });
});

describe('command signing', () => {
  before(() => {
    process.env.COMMAND_SIGNING_SECRET = SECRET;
  });
  after(restoreEnv);

  it('validates matching signature', () => {
    const cmd = baseCommand();
    const sig = signCommand(cmd, SECRET);
    assert.equal(verifyCommandSignature(cmd, sig, SECRET), true);
    assert.equal(agentVerify(cmd, sig, SECRET), true);
  });

  it('rejects changed params', () => {
    const cmd = baseCommand({ type: 'LAUNCH_APP', params: { appId: 'notepad' } });
    const sig = signCommand(cmd, SECRET);
    const tampered = { ...cmd, params: { appId: 'evil' } };
    assert.equal(verifyCommandSignature(tampered, sig, SECRET), false);
  });

  it('rejects invalid signature', () => {
    const cmd = baseCommand();
    assert.equal(verifyCommandSignature(cmd, 'deadbeef', SECRET), false);
  });
});

describe('replay protection', () => {
  it('rejects duplicate id and nonce', () => {
    const id = randomUUID();
    const nonce = randomBytes(16).toString('hex');
    assert.equal(isReplay(id, nonce), false);
    recordExecuted(id, nonce);
    assert.equal(isReplay(id, nonce), true);
    loadExecutedCommands();
  });
});

describe('password hash', () => {
  it('hashes and verifies password', () => {
    const hash = hashCommandPassword('secret-pass');
    assert.match(hash, /^scrypt\$/);
    assert.equal(verifyCommandPassword('secret-pass', hash), true);
    assert.equal(verifyCommandPassword('wrong', hash), false);
  });
});

describe('commands availability', () => {
  afterEach(restoreEnv);

  it('disabled by default', () => {
    process.env.COMMANDS_ENABLED = 'false';
    assert.equal(isCommandsAvailable(true).enabled, false);
  });

  it('production without postgres is disabled', () => {
    process.env.COMMANDS_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    process.env.COMMAND_SIGNING_SECRET = SECRET;
    process.env.COMMAND_ADMIN_PASSWORD_HASH = hashCommandPassword('x');
    process.env.COMMAND_SESSION_SECRET = 'session-secret';
    assert.equal(isCommandsAvailable(false).enabled, false);
  });
});

describe('CommandManager', () => {
  let manager;

  beforeEach(() => {
    restoreEnv();
    process.env.COMMANDS_ENABLED = 'true';
    process.env.NODE_ENV = 'test';
    process.env.COMMAND_SIGNING_SECRET = SECRET;
    process.env.COMMAND_ADMIN_PASSWORD_HASH = hashCommandPassword('admin');
    process.env.COMMAND_SESSION_SECRET = 'session-secret-key';

    manager = new CommandManager();
    manager.isAgentOnline = () => true;
    manager.getAgentInfo = () => ({
      deviceId: 'device-1',
      hostname: 'TEST-PC',
      agentVersion: '2.0.0',
      capabilities: { lock: true, apps: [{ id: 'notepad', label: 'Notepad' }] },
    });
    manager.agentSocket = { readyState: 1, send: () => {} };
    manager.dashboards = new Set();
  });

  it('creates command with idempotency', async () => {
    const req = { socket: { remoteAddress: '127.0.0.1' }, headers: {} };
    const body = { type: 'LOCK', idempotencyKey: 'key-1' };
    const first = await manager.createCommand(body, req);
    const second = await manager.createCommand(body, req);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.duplicate, true);
    assert.equal(first.command.id, second.command.id);
  });

  it('rejects expired command delivery', async () => {
    const cmd = baseCommand({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    cmd.signature = signCommand(cmd, SECRET);
    cmd.status = 'pending';
    await manager.store.insert(cmd);
    const delivered = await manager.deliverCommand(cmd);
    assert.equal(delivered, false);
    const updated = await manager.store.getById(cmd.id);
    assert.equal(updated.status, 'expired');
  });

  it('cancels pending command', async () => {
    const req = { socket: { remoteAddress: '127.0.0.1' }, headers: {} };
    const created = await manager.createCommand({ type: 'LOCK' }, req);
    const cancelled = await manager.cancelCommand(created.command.id, req);
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.command.status, 'cancelled');
  });

  it('rejects cancel after running', async () => {
    const cmd = baseCommand();
    cmd.status = 'running';
    cmd.signature = signCommand(cmd, SECRET);
    await manager.store.insert(cmd);
    const req = { socket: { remoteAddress: '127.0.0.1' }, headers: {} };
    const cancelled = await manager.cancelCommand(cmd.id, req);
    assert.equal(cancelled.ok, false);
  });

  it('rejects appId outside whitelist via schema', async () => {
    const req = { socket: { remoteAddress: '127.0.0.1' }, headers: {} };
    const result = await manager.createCommand({
      type: 'LAUNCH_APP',
      params: { appId: 'malware.exe' },
    }, req);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'INVALID_APP_ID');
  });

  it('sanitizes screenshot base64 from list responses', () => {
    const pub = manager.publicCommand({
      id: '1',
      deviceId: 'device-1',
      type: 'SCREENSHOT',
      params: {},
      status: 'succeeded',
      createdAt: new Date().toISOString(),
      expiresAt: new Date().toISOString(),
      requestedBy: 'x',
      result: { imageBase64: 'abc', mimeType: 'image/jpeg', telegramSent: true },
    });
    assert.equal(pub.result.hasPreview, true);
    assert.equal(pub.result.telegramSent, true);
    assert.equal(pub.result.imageBase64, undefined);
  });

  it('triggers telegram alert on screenshot success', async () => {
    /** @type {object[]} */
    const alerts = [];
    manager.onTelegramAlert = async (e) => { alerts.push(e); };
    const cmd = baseCommand({ type: 'SCREENSHOT' });
    cmd.status = 'running';
    cmd.signature = signCommand(cmd, SECRET);
    await manager.store.insert(cmd);
    await manager.handleCommandResult({
      commandId: cmd.id,
      status: 'succeeded',
      result: { imageBase64: Buffer.from('jpeg').toString('base64'), mimeType: 'image/jpeg' },
    });
    assert.equal(alerts.length, 2);
    assert.equal(alerts[0].kind, 'screenshot_photo');
    assert.ok(alerts[0].imageBase64);
  });
});
