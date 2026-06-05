/** @param {Record<string, unknown>} row */
export function mapCommandRow(row) {
  return {
    id: row.id,
    deviceId: row.device_id,
    type: row.command_type,
    params: row.params_json ?? {},
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    requestedBy: row.requested_by,
    nonce: row.nonce,
    signature: row.signature,
    acknowledgedAt: row.acknowledged_at,
    completedAt: row.completed_at,
    result: row.result_json,
    errorCode: row.error_code,
    idempotencyKey: row.idempotency_key,
    cancelledAt: row.cancelled_at,
    version: row.version ?? 1,
    confirmationLevel: row.confirmation_level,
  };
}

export class CommandStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.memory = new Map();
    /** @type {Map<string, string>} */
    this.idempotency = new Map();
    /** @type {import('pg').Pool | null} */
    this.pool = null;
  }

  /** @param {import('pg').Pool} pool */
  async initPostgres(pool) {
    this.pool = pool;
  }

  hasPostgres() {
    return Boolean(this.pool);
  }

  /** @param {object} command */
  async insert(command) {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO remote_commands
         (id, device_id, command_type, params_json, status, created_at, expires_at, requested_by, nonce, signature, idempotency_key, version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          command.id,
          command.deviceId,
          command.type,
          JSON.stringify(command.params ?? {}),
          command.status,
          command.createdAt,
          command.expiresAt,
          command.requestedBy,
          command.nonce,
          command.signature,
          command.idempotencyKey ?? null,
          command.version ?? 1,
        ],
      );
      return command;
    }
    this.memory.set(command.id, { ...command });
    if (command.idempotencyKey) this.idempotency.set(command.idempotencyKey, command.id);
    return command;
  }

  /** @param {string} idempotencyKey */
  async findByIdempotencyKey(idempotencyKey) {
    if (this.pool) {
      const { rows } = await this.pool.query(
        `SELECT * FROM remote_commands WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey],
      );
      return rows[0] ? mapCommandRow(rows[0]) : null;
    }
    const id = this.idempotency.get(idempotencyKey);
    return id ? this.memory.get(id) ?? null : null;
  }

  /** @param {string} id */
  async getById(id) {
    if (this.pool) {
      const { rows } = await this.pool.query(`SELECT * FROM remote_commands WHERE id = $1`, [id]);
      return rows[0] ? mapCommandRow(rows[0]) : null;
    }
    return this.memory.get(id) ?? null;
  }

  /** @param {{ deviceId?: string, limit?: number }} [opts] */
  async list(opts = {}) {
    const limit = Math.min(opts.limit ?? 50, 100);
    if (this.pool) {
      const params = [];
      let sql = `SELECT * FROM remote_commands`;
      if (opts.deviceId) {
        params.push(opts.deviceId);
        sql += ` WHERE device_id = $${params.length}`;
      }
      params.push(limit);
      sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
      const { rows } = await this.pool.query(sql, params);
      return rows.map(mapCommandRow);
    }
    const all = [...this.memory.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return all.slice(0, limit);
  }

  /** @param {string} id @param {Partial<object>} patch */
  async update(id, patch) {
    if (this.pool) {
      const fields = [];
      const values = [];
      const map = {
        status: 'status',
        acknowledgedAt: 'acknowledged_at',
        completedAt: 'completed_at',
        result: 'result_json',
        errorCode: 'error_code',
        cancelledAt: 'cancelled_at',
      };
      for (const [k, col] of Object.entries(map)) {
        if (patch[k] !== undefined) {
          values.push(k === 'result' ? JSON.stringify(patch[k]) : patch[k]);
          fields.push(`${col} = $${values.length}`);
        }
      }
      if (!fields.length) return this.getById(id);
      values.push(id);
      await this.pool.query(`UPDATE remote_commands SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
      return this.getById(id);
    }
    const cur = this.memory.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.memory.set(id, next);
    return next;
  }

  /** @param {string} deviceId */
  async listPendingForDevice(deviceId) {
    const now = new Date().toISOString();
    if (this.pool) {
      const { rows } = await this.pool.query(
        `SELECT * FROM remote_commands
         WHERE device_id = $1 AND status = 'pending' AND expires_at > $2
         ORDER BY created_at ASC`,
        [deviceId, now],
      );
      return rows.map(mapCommandRow);
    }
    return [...this.memory.values()].filter(
      (c) => c.deviceId === deviceId && c.status === 'pending' && c.expiresAt > now,
    );
  }

  async expireStale() {
    const now = new Date().toISOString();
    if (this.pool) {
      await this.pool.query(
        `UPDATE remote_commands SET status = 'expired', completed_at = $1
         WHERE status IN ('pending','sent') AND expires_at <= $2`,
        [now, now],
      );
      return;
    }
    for (const [id, cmd] of this.memory) {
      if (['pending', 'sent'].includes(cmd.status) && cmd.expiresAt <= now) {
        this.memory.set(id, { ...cmd, status: 'expired', completedAt: now });
      }
    }
  }
}
