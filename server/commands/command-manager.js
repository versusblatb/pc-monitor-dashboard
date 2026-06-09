import { randomBytes, randomUUID } from 'node:crypto';
import { AuditStore } from './audit-store.js';
import { getConfirmationLevel, getCommandTtlMs } from './command-types.js';
import { validateCommandParams, validateCommandType, validateConfirmation } from './command-schema.js';
import { signCommand } from './command-signing.js';
import { AppsRegistry } from './apps-registry.js';
import { CommandStore } from './command-store.js';
import { isCommandsAvailable, signingSecret } from './commands-config.js';

export class CommandManager {
  constructor() {
    this.store = new CommandStore();
    this.audit = new AuditStore();
    this.apps = new AppsRegistry();
    /** @type {import('ws').WebSocket | null} */
    this.agentSocket = null;
    /** @type {() => boolean} */
    this.isAgentOnline = () => false;
    /** @type {() => { deviceId: string|null, capabilities: object|null, hostname: string|null, agentVersion: string|null } | null} */
    this.getAgentInfo = () => null;
    /** @type {Set<import('ws').WebSocket>} */
    this.dashboards = new Set();
    /** @type {(event: object) => void | Promise<void>} */
    this.onTelegramAlert = async () => {};
  }

  /** @param {import('pg').Pool} pool */
  async initPostgres(pool) {
    await this.store.initPostgres(pool);
    await this.audit.initPostgres(pool);
  }

  availability() {
    return isCommandsAvailable(this.store.hasPostgres());
  }

  /**
   * @param {object} input
   * @param {import('http').IncomingMessage} req
   */
  async createCommand(input, req) {
    const avail = this.availability();
    if (!avail.enabled) return { ok: false, error: avail.reason, status: 403 };

    const typeCheck = validateCommandType(input.type);
    if (!typeCheck.ok) return { ok: false, error: typeCheck.error, status: 400 };

    const paramsCheck = validateCommandParams(typeCheck.type, input.params);
    if (!paramsCheck.ok) return { ok: false, error: paramsCheck.error, status: 400 };

    const confirmCheck = validateConfirmation(typeCheck.type, input.confirmation);
    if (!confirmCheck.ok) return { ok: false, error: confirmCheck.error, status: 400 };

    const agent = this.getAgentInfo();
    if (!agent?.deviceId) return { ok: false, error: 'AGENT_NOT_AUTHENTICATED', status: 503 };
    if (input.deviceId && input.deviceId !== agent.deviceId) {
      return { ok: false, error: 'DEVICE_MISMATCH', status: 400 };
    }

    if (input.idempotencyKey) {
      const existing = await this.store.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return { ok: true, command: this.publicCommand(existing), duplicate: true };
    }

    const now = Date.now();
    const ttl = getCommandTtlMs(typeCheck.type);
    const command = {
      id: randomUUID(),
      deviceId: agent.deviceId,
      type: typeCheck.type,
      params: paramsCheck.params,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl).toISOString(),
      requestedBy: 'command-session',
      status: 'pending',
      nonce: randomBytes(16).toString('hex'),
      version: 1,
      confirmationLevel: getConfirmationLevel(typeCheck.type),
      idempotencyKey: input.idempotencyKey ?? null,
      result: null,
      errorCode: null,
    };

    command.signature = signCommand(command, signingSecret());
    await this.store.insert(command);

    const meta = AuditStore.metaFromRequest(req);
    await this.audit.append({
      commandId: command.id,
      eventType: 'command_requested',
      actorType: 'operator',
      deviceId: command.deviceId,
      safeMetadata: { type: command.type },
      ...meta,
    });

    if (this.isAgentOnline()) {
      await this.deliverCommand(command);
    }

    this.broadcastCommandUpdate(command);
    return { ok: true, command: this.publicCommand(command) };
  }

  /** @param {object} command */
  async deliverCommand(command) {
    if (!this.agentSocket || this.agentSocket.readyState !== 1) return false;
    if (new Date(command.expiresAt).getTime() <= Date.now()) {
      await this.store.update(command.id, { status: 'expired', completedAt: new Date().toISOString() });
      return false;
    }

    const wire = {
      id: command.id,
      deviceId: command.deviceId,
      type: command.type,
      params: command.params ?? {},
      createdAt: command.createdAt,
      expiresAt: command.expiresAt,
      nonce: command.nonce,
      version: command.version ?? 1,
    };

    this.agentSocket.send(JSON.stringify({
      type: 'remote_command',
      payload: { command: wire, signature: command.signature },
    }));

    const updated = await this.store.update(command.id, { status: 'sent' });
    await this.audit.append({
      commandId: command.id,
      eventType: 'command_delivered',
      deviceId: command.deviceId,
      safeMetadata: { type: command.type },
    });
    this.broadcastCommandUpdate(updated);
    return true;
  }

  /** @param {object} payload */
  async handleCommandAck(payload) {
    const id = payload?.commandId;
    if (!id) return;
    const cmd = await this.store.getById(id);
    if (!cmd || ['succeeded', 'failed', 'expired', 'cancelled', 'rejected'].includes(cmd.status)) return;

    const updated = await this.store.update(id, {
      status: payload.status === 'running' ? 'running' : 'acknowledged',
      acknowledgedAt: new Date().toISOString(),
    });
    await this.audit.append({
      commandId: id,
      eventType: payload.status === 'running' ? 'command_running' : 'command_acknowledged',
      deviceId: cmd.deviceId,
    });
    this.broadcastCommandUpdate(updated);
  }

  /** @param {object} payload */
  async handleCommandResult(payload) {
    const id = payload?.commandId;
    if (!id) return { ok: false };
    const cmd = await this.store.getById(id);
    if (!cmd) return { ok: false };

    const status = payload.status === 'succeeded' ? 'succeeded' : 'failed';
    const rawResult = payload.result ?? null;

    if (cmd.type === 'SCREENSHOT' && status === 'succeeded' && rawResult?.imageBase64) {
      await this.onTelegramAlert({
        kind: 'screenshot_photo',
        command: cmd,
        hostname: this.getAgentInfo()?.hostname,
        imageBase64: rawResult.imageBase64,
      });
    }

    const storedResult = rawResult?.imageBase64
      ? { ...rawResult, telegramSent: cmd.type === 'SCREENSHOT' && status === 'succeeded' }
      : rawResult;

    const updated = await this.store.update(id, {
      status,
      result: storedResult,
      errorCode: payload.errorCode ?? null,
      completedAt: payload.completedAt ?? new Date().toISOString(),
    });

    await this.audit.append({
      commandId: id,
      eventType: status === 'succeeded' ? 'command_succeeded' : 'command_failed',
      deviceId: cmd.deviceId,
      safeMetadata: { errorCode: payload.errorCode ?? null },
    });

    if (['RESTART', 'SHUTDOWN', 'SCREENSHOT'].includes(cmd.type)) {
      await this.onTelegramAlert({
        kind: status === 'succeeded' ? 'dangerous_succeeded' : 'dangerous_rejected',
        command: updated,
        hostname: this.getAgentInfo()?.hostname,
      });
    } else if (status === 'failed') {
      await this.onTelegramAlert({
        kind: 'command_failed',
        command: updated,
        hostname: this.getAgentInfo()?.hostname,
      });
    }

    this.broadcastCommandUpdate(updated, {
      includeImage: cmd.type === 'SCREENSHOT' && status === 'succeeded',
    });
    return { ok: true };
  }

  /** @param {string} id @param {import('http').IncomingMessage} req */
  async cancelCommand(id, req) {
    const cmd = await this.store.getById(id);
    if (!cmd) return { ok: false, error: 'NOT_FOUND', status: 404 };
    if (!['pending', 'sent'].includes(cmd.status)) {
      return { ok: false, error: 'CANNOT_CANCEL', status: 409 };
    }
    const updated = await this.store.update(id, {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
    });
    const meta = AuditStore.metaFromRequest(req);
    await this.audit.append({
      commandId: id,
      eventType: 'command_cancelled',
      actorType: 'operator',
      deviceId: cmd.deviceId,
      ...meta,
    });
    this.broadcastCommandUpdate(updated);
    return { ok: true, command: this.publicCommand(updated) };
  }

  async expireStaleCommands() {
    await this.store.expireStale();
  }

  /** @param {import('ws').WebSocket} ws */
  async onAgentReconnect(ws) {
    this.agentSocket = ws;
    const agent = this.getAgentInfo();
    if (!agent?.deviceId) return;
    if (this.apps.listPublic().length > 0) {
      this.syncAppsToAgent();
    }
    const pending = await this.store.listPendingForDevice(agent.deviceId);
    for (const cmd of pending) {
      await this.deliverCommand(cmd);
    }
  }

  syncAppsToAgent() {
    if (!this.agentSocket || this.agentSocket.readyState !== 1) return false;
    if (!this.apps.apps.length) return false;
    this.agentSocket.send(JSON.stringify({
      type: 'apps_config',
      payload: { apps: this.apps.apps },
    }));
    return true;
  }

  /** @param {unknown[]} apps */
  updateApps(apps) {
    const result = this.apps.replaceAll(apps);
    if (!result.ok) return result;
    const synced = this.syncAppsToAgent();
    return { ...result, synced };
  }

  async expireRunningCommands(maxAgeMs = 60_000) {
    await this.store.expireRunning(maxAgeMs);
  }

  /** @param {object} command @param {{ includeImage?: boolean }} [opts] */
  broadcastCommandUpdate(command, opts = {}) {
    if (!command) return;
    const msg = JSON.stringify({
      type: 'command_update',
      payload: { command: this.publicCommand(command, opts) },
    });
    for (const d of this.dashboards) {
      if (d.readyState === 1) d.send(msg);
    }
  }

  /** @param {object|null|undefined} result @param {{ includeImage?: boolean }} [opts] */
  sanitizeResult(result, opts = {}) {
    if (!result || typeof result !== 'object') return result ?? null;
    if (result.imageBase64 && !opts.includeImage) {
      const { imageBase64, ...rest } = result;
      return {
        ...rest,
        hasPreview: true,
        telegramSent: Boolean(rest.telegramSent),
      };
    }
    return result;
  }

  /** @param {object} command @param {{ includeImage?: boolean }} [opts] */
  publicCommand(command, opts = {}) {
    return {
      id: command.id,
      deviceId: command.deviceId,
      type: command.type,
      params: command.params ?? {},
      status: command.status,
      createdAt: command.createdAt,
      expiresAt: command.expiresAt,
      requestedBy: command.requestedBy,
      confirmationLevel: command.confirmationLevel ?? getConfirmationLevel(command.type),
      acknowledgedAt: command.acknowledgedAt ?? null,
      completedAt: command.completedAt ?? null,
      result: this.sanitizeResult(command.result, opts),
      errorCode: command.errorCode ?? null,
      cancelledAt: command.cancelledAt ?? null,
    };
  }

  getCapabilities() {
    const agent = this.getAgentInfo();
    const avail = this.availability();
    return {
      commandsEnabled: avail.enabled,
      disabledReason: avail.reason,
      agentOnline: this.isAgentOnline(),
      deviceId: agent?.deviceId ?? null,
      hostname: agent?.hostname ?? null,
      agentVersion: agent?.agentVersion ?? null,
      capabilities: agent?.capabilities ?? null,
    };
  }
}
