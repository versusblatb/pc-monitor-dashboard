import os from 'node:os';
import { sanitizeHostname } from './lib/validate.js';

/**
 * Build schema v2 payload from cached collector state.
 * @param {{
 *   system: Record<string, unknown>,
 *   cpu: Record<string, unknown>,
 *   gpu: Record<string, unknown>,
 *   memory: Record<string, unknown>,
 *   network: Record<string, unknown>,
 *   disks: Array<Record<string, unknown>>,
 *   processes: Record<string, unknown>,
 *   uptime: number|null,
 * }} state
 */
export function buildPayload(state) {
  const hostname = sanitizeHostname(os.hostname());

  return {
    hostname,
    system: state.system,
    cpu: state.cpu,
    gpu: state.gpu,
    memory: state.memory,
    network: state.network,
    disks: state.disks,
    processes: state.processes,
    uptime: state.uptime,
    ts: Date.now(),
  };
}
