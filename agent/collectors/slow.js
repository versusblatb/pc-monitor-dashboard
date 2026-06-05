import si from 'systeminformation';
import { safeBlock } from '../lib/safe.js';
import { sanitizeProcessList } from '../lib/validate.js';

const EMPTY = { total: 0, topCpu: [], topMemory: [] };

/** @returns {Promise<typeof EMPTY>} */
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
    { ...EMPTY },
    'processes',
    8000,
  );
}
