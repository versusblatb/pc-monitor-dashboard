import { hashSensitive } from './crypto-utils.js';

const RETENTION_DAYS = Number(process.env.COMMAND_AUDIT_RETENTION_DAYS) || 30;

export class AuditStore {
  constructor() {
    /** @type {object[]} */
    this.memory = [];
    /** @type {import('pg').Pool | null} */
    this.pool = null;
  }

  /** @param {import('pg').Pool} pool */
  async initPostgres(pool) {
    this.pool = pool;
  }

  /**
   * @param {object} entry
   */
  async append(entry) {
    const row = {
      commandId: entry.commandId ?? null,
      eventType: entry.eventType,
      timestamp: entry.timestamp ?? new Date().toISOString(),
      actorType: entry.actorType ?? 'system',
      actorId: entry.actorId ?? null,
      deviceId: entry.deviceId ?? null,
      safeMetadata: entry.safeMetadata ?? {},
      ipHash: entry.ipHash ?? null,
      userAgentHash: entry.userAgentHash ?? null,
    };

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO command_audit_log
         (command_id, event_type, timestamp, actor_type, actor_id, device_id, safe_metadata_json, ip_hash, user_agent_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          row.commandId,
          row.eventType,
          row.timestamp,
          row.actorType,
          row.actorId,
          row.deviceId,
          JSON.stringify(row.safeMetadata),
          row.ipHash,
          row.userAgentHash,
        ],
      );
      return row;
    }

    this.memory.push({ id: this.memory.length + 1, ...row });
    return row;
  }

  /** @param {import('http').IncomingMessage} req */
  static metaFromRequest(req) {
    return {
      ipHash: hashSensitive(req.socket.remoteAddress ?? ''),
      userAgentHash: hashSensitive(req.headers['user-agent'] ?? ''),
    };
  }

  /** @param {{ limit?: number }} [opts] */
  async list(opts = {}) {
    const limit = Math.min(opts.limit ?? 100, 500);
    if (this.pool) {
      const { rows } = await this.pool.query(
        `SELECT id, command_id, event_type, timestamp, actor_type, actor_id, device_id, safe_metadata_json
         FROM command_audit_log ORDER BY timestamp DESC LIMIT $1`,
        [limit],
      );
      return rows.map(mapAuditRow);
    }
    return this.memory.slice(-limit).reverse();
  }

  /** @param {{ format?: 'json'|'csv' }} [opts] */
  async export(opts = {}) {
    const rows = await this.list({ limit: 500 });
    if (opts.format === 'csv') {
      const header = 'id,command_id,event_type,timestamp,actor_type,device_id';
      const lines = rows.map((r) =>
        [r.id, r.commandId, r.eventType, r.timestamp, r.actorType, r.deviceId].join(','),
      );
      return `${header}\n${lines.join('\n')}`;
    }
    return JSON.stringify(rows, null, 2);
  }

  async prune() {
    if (!this.pool) return;
    await this.pool.query(
      `DELETE FROM command_audit_log WHERE timestamp < NOW() - INTERVAL '${RETENTION_DAYS} days'`,
    );
  }
}

/** @param {Record<string, unknown>} row */
function mapAuditRow(row) {
  return {
    id: row.id,
    commandId: row.command_id,
    eventType: row.event_type,
    timestamp: row.timestamp,
    actorType: row.actor_type,
    actorId: row.actor_id,
    deviceId: row.device_id,
    safeMetadata: row.safe_metadata_json,
  };
}
