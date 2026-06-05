import os from 'node:os';
import si from 'systeminformation';
import { AGENT_VERSION } from '../config.js';
import { safeBlock } from '../lib/safe.js';

const EMPTY = {
  manufacturer: null,
  model: null,
  os: null,
  arch: null,
  bios: null,
  agentVersion: AGENT_VERSION,
  lastBoot: null,
};

/** @returns {Promise<typeof EMPTY>} */
export async function collectStatic() {
  return safeBlock(
    async () => {
      const [system, osInfo, bios, time] = await Promise.all([
        si.system(),
        si.osInfo(),
        si.bios().catch(() => null),
        si.time(),
      ]);

      return {
        manufacturer: system.manufacturer || null,
        model: system.model || null,
        os: osInfo.distro
          ? `${osInfo.distro} ${osInfo.release || ''}`.trim()
          : osInfo.platform || null,
        arch: os.arch() || osInfo.arch || null,
        bios: bios?.version || null,
        agentVersion: AGENT_VERSION,
        lastBoot: time?.uptime != null ? new Date(Date.now() - time.uptime * 1000).toISOString() : null,
      };
    },
    { ...EMPTY },
    'static-system',
    8000,
  );
}
