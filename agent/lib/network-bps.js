import { execFileSync } from 'node:child_process';

/** @type {{ iface: string, rx: number, tx: number, ts: number } | null} */
let prevCounter = null;

function ps(script) {
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', timeout: 5000, windowsHide: true },
  ).trim();
}

/**
 * Windows perf counters — bytes/sec without systeminformation.
 * @param {string | null | undefined} preferredIface
 */
export function getNetworkBpsWindows(preferredIface) {
  if (process.platform !== 'win32') return { downloadBps: null, uploadBps: null, pingMs: null };

  try {
    const safe = String(preferredIface ?? '').replace(/'/g, "''");
    const script = `
      $rows = Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface |
        Where-Object { $_.Name -notmatch 'Loopback|ISATAP|Teredo|Clash|TUN|IKE|Pseudo|VPN' }
      if ('${safe}') {
        $hit = $rows | Where-Object { $_.Name -like "*${safe}*" } | Select-Object -First 1
        if ($hit) { $rows = @($hit) }
      }
      $row = $rows | Sort-Object { [uint64]$_.BytesReceivedPersec + [uint64]$_.BytesSentPersec } -Descending | Select-Object -First 1
      if (-not $row) { exit 0 }
      @{ rx = [uint64]$row.BytesReceivedPersec; tx = [uint64]$row.BytesSentPersec; name = $row.Name } | ConvertTo-Json -Compress
    `;
    const raw = ps(script);
    if (!raw) return { downloadBps: null, uploadBps: null, pingMs: null };

    const data = JSON.parse(raw);
    const rx = Number(data.rx);
    const tx = Number(data.tx);
    if (!Number.isFinite(rx) || !Number.isFinite(tx)) {
      return { downloadBps: null, uploadBps: null, pingMs: null };
    }

    return { downloadBps: rx, uploadBps: tx, pingMs: null };
  } catch {
    return tryCounterDelta(preferredIface);
  }
}

/** @param {string | null | undefined} preferredIface */
function tryCounterDelta(preferredIface) {
  try {
    const safe = String(preferredIface ?? '').replace(/'/g, "''");
    const script = `
      $a = Get-NetAdapterStatistics -Name '${safe}' -ErrorAction SilentlyContinue
      if (-not $a) { $a = Get-NetAdapter | Where-Object Status -eq 'Up' | Select-Object -First 1 | Get-NetAdapterStatistics }
      if (-not $a) { exit 0 }
      @{ rx = [uint64]$a.ReceivedBytes; tx = [uint64]$a.SentBytes } | ConvertTo-Json -Compress
    `;
    const raw = ps(script);
    if (!raw) return { downloadBps: null, uploadBps: null, pingMs: null };

    const data = JSON.parse(raw);
    const rx = Number(data.rx);
    const tx = Number(data.tx);
    const ts = Date.now();

    if (!Number.isFinite(rx) || !Number.isFinite(tx)) {
      return { downloadBps: null, uploadBps: null, pingMs: null };
    }

    if (prevCounter && prevCounter.iface === (preferredIface ?? '') && ts > prevCounter.ts) {
      const dt = (ts - prevCounter.ts) / 1000;
      if (dt >= 0.8) {
        const downloadBps = Math.max(0, Math.round((rx - prevCounter.rx) / dt));
        const uploadBps = Math.max(0, Math.round((tx - prevCounter.tx) / dt));
        prevCounter = { iface: preferredIface ?? '', rx, tx, ts };
        return { downloadBps, uploadBps, pingMs: null };
      }
    }

    prevCounter = { iface: preferredIface ?? '', rx, tx, ts };
    return { downloadBps: null, uploadBps: null, pingMs: null };
  } catch {
    return { downloadBps: null, uploadBps: null, pingMs: null };
  }
}
