/**
 * Optional PostgreSQL history store — enabled when DATABASE_URL is set.
 */
export class PostgresHistoryStore {
  /**
   * @param {import('pg').Pool} pool
   * @param {number} retentionDays
   */
  constructor(pool, retentionDays = 7) {
    this.pool = pool;
    this.retentionDays = retentionDays;
  }

  /** @param {Record<string, unknown>} point */
  async append(point) {
    await this.pool.query(
      `INSERT INTO metric_history
        (ts, hostname, cpu, gpu, ram, cpu_temp, gpu_temp, download_bps, upload_bps, disk_summary, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        new Date(Number(point.ts)),
        point.hostname ?? 'unknown',
        point.cpu ?? null,
        point.gpu ?? null,
        point.ram ?? null,
        point.cpuTemp ?? null,
        point.gpuTemp ?? null,
        point.downloadBps ?? null,
        point.uploadBps ?? null,
        JSON.stringify(point.diskSummary ?? {}),
        point.status ?? null,
      ],
    );
  }

  /** @param {{ from: number, to: number, maxPoints?: number }} q */
  async query({ from, to, maxPoints = 500 }) {
    const { rows } = await this.pool.query(
      `SELECT ts, hostname, cpu, gpu, ram, cpu_temp, gpu_temp, download_bps, upload_bps, disk_summary, status
       FROM metric_history WHERE ts >= $1 AND ts <= $2 ORDER BY ts ASC`,
      [new Date(from), new Date(to)],
    );
    const mapped = rows.map((r) => ({
      ts: r.ts.getTime(),
      hostname: r.hostname,
      cpu: r.cpu,
      gpu: r.gpu,
      ram: r.ram,
      cpuTemp: r.cpu_temp,
      gpuTemp: r.gpu_temp,
      downloadBps: r.download_bps,
      uploadBps: r.upload_bps,
      diskSummary: r.disk_summary,
      status: r.status,
    }));
    const { downsample } = await import('./memory-store.js');
    return downsample(mapped, maxPoints);
  }

  async prune() {
    await this.pool.query(
      `DELETE FROM metric_history WHERE ts < NOW() - ($1 || ' days')::interval`,
      [String(this.retentionDays)],
    );
  }
}
