import si from 'systeminformation';
import { safeBlock } from '../lib/safe.js';
import { sanitizeProcessList } from '../lib/validate.js';

/** @returns {Promise<{ total: number, topCpu: unknown[], topMemory: unknown[] }|null>} */
export async function collectProcesses() {
  return safeBlock(
    async () => {
      const list = await si.processes();
      const all = list?.list || [];
      const sanitized = sanitizeProcessList(
        all.map((p) => ({
          name: p.name,
          pid: p.pid,
          cpu: p.cpu,
          mem: p.memRss,
          memPercent: p.mem,
        })),
        'cpu',
      );
      return {
        total: list?.all ?? sanitized.total,
        topCpu: sanitized.topCpu,
        topMemory: sanitized.topMemory,
      };
    },
    null,
    'processes',
    8000,
  );
}
