import os from 'node:os';

const VPN_NAME_RE = /clash|ficlash|wintun|wireguard|openvpn|nordlynx|tailscale|zerotier|hamachi|vpn|tun\d*|tap\d*|meta|mihomo|surge|v2ray|nephobox|packet/i;
const VIRTUAL_NAME_RE = /virtual|vethernet|hyper-v|vmware|virtualbox|npcap|bluetooth|loopback/i;

/** @param {string} ip */
function scoreIpv4(ip) {
  if (!ip) return -10;
  if (ip.startsWith('198.18.') || ip.startsWith('198.19.')) return -8;
  if (ip.startsWith('127.')) return -10;
  if (ip.startsWith('169.254.')) return -4;
  if (ip.startsWith('192.168.')) return 5;
  if (ip.startsWith('10.')) return 4;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return 4;
  return 1;
}

/** @param {string} name */
function scoreIfaceName(name) {
  const lower = name.toLowerCase();
  let score = 0;
  if (VPN_NAME_RE.test(lower)) score -= 12;
  if (VIRTUAL_NAME_RE.test(lower)) score -= 6;
  if (lower.includes('ethernet') || lower.startsWith('eth')) score += 8;
  if (lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wlan')) score += 6;
  if (lower.includes('realtek') || lower.includes('intel')) score += 2;
  return score;
}

/** Cached CPU static info from Node.js (no WMI). */
export function getCpuOsInfo() {
  const cpus = os.cpus();
  if (!cpus?.length) {
    return {
      model: null,
      physicalCores: null,
      logicalCores: null,
      frequencyMhz: null,
    };
  }

  const logical = cpus.length;
  const first = cpus[0];
  const speed = first?.speed;

  return {
    model: first?.model?.trim() || null,
    logicalCores: logical,
    physicalCores: logical,
    frequencyMhz: Number.isFinite(speed) ? Math.round(speed) : null,
  };
}

/**
 * Rank all usable interfaces; prefer real LAN over VPN/TUN (e.g. FIClashX).
 * @returns {Array<{ interface: string, ipv4: string, type: string, linkSpeedMbps: null, score: number }>}
 */
export function listNetworkOsCandidates() {
  const entries = os.networkInterfaces();
  if (!entries) return [];

  const ranked = [];

  for (const [name, addrs] of Object.entries(entries)) {
    if (!addrs?.length) continue;
    const lower = name.toLowerCase();
    if (lower.includes('loopback') || lower === 'lo') continue;

    const ipv4 = addrs.find((a) => a.family === 'IPv4' && !a.internal);
    if (!ipv4) continue;

    const score = scoreIfaceName(name) + scoreIpv4(ipv4.address);
    ranked.push({
      interface: name,
      ipv4: ipv4.address,
      type: lower.includes('wi-fi') || lower.includes('wifi') || lower.includes('wlan') ? 'wireless' : 'wired',
      linkSpeedMbps: null,
      score,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/**
 * Best LAN interface + IPv4 from os.networkInterfaces.
 */
export function getNetworkOsInfo() {
  return listNetworkOsCandidates()[0] ?? null;
}
