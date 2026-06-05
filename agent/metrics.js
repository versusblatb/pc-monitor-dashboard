import { execFileSync, execSync } from 'node:child_process';
import os from 'node:os';

let prevCpu = sampleCpuTimes();

function ps(script) {
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', timeout: 4000, windowsHide: true },
  ).trim();
}

function sampleCpuTimes() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + (t.irq ?? 0);
  }
  return { idle, total };
}

/** CPU % — WMI works on localized Windows (Get-Counter needs English paths) */
function getCpuWindows() {
  try {
    const raw = ps(
      "Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter \"Name='_Total'\" | Select-Object -ExpandProperty PercentProcessorTime",
    );
    const v = parseFloat(raw);
    if (Number.isFinite(v)) return Math.min(100, Math.max(0, Math.round(v)));
  } catch {
    /* fallback below */
  }
  return null;
}

/** NVIDIA GPU % + name */
function getGpuWindows() {
  let name = 'GPU';
  try {
    const info = execSync(
      'nvidia-smi --query-gpu=name,utilization.gpu --format=csv,noheader,nounits',
      { encoding: 'utf8', timeout: 4000, windowsHide: true },
    ).trim();
    const [gpuName, util] = info.split(',').map((s) => s.trim());
    if (gpuName) name = gpuName.replace('NVIDIA ', '').replace('GeForce ', '');
    const v = parseInt(util, 10);
    if (Number.isFinite(v)) {
      return { gpu: Math.min(100, Math.max(0, v)), gpuName: name, gpuAvailable: true };
    }
  } catch {
    /* fallback */
  }

  try {
    const raw = ps(
      "(Get-Counter '\\GPU Engine(*engtype_3D*)\\Utilization Percentage').CounterSamples | Measure-Object -Property CookedValue -Maximum | Select-Object -ExpandProperty Maximum",
    );
    const v = parseFloat(raw);
    if (Number.isFinite(v)) {
      return { gpu: Math.min(100, Math.max(0, Math.round(v))), gpuName: name, gpuAvailable: true };
    }
  } catch {
    /* no gpu */
  }
  return { gpu: 0, gpuName: name, gpuAvailable: false };
}

function getDiskLoadMap() {
  try {
    const raw = ps(
      'Get-CimInstance Win32_PerfFormattedData_PerfDisk_LogicalDisk | Where-Object { $_.Name -match "^[A-Z]:$" } | Select-Object @{N="letter";E={$_.Name}}, @{N="loadPct";E={[int]$_.PercentDiskTime}} | ConvertTo-Json -Compress',
    );
    let rows = JSON.parse(raw || '[]');
    if (!Array.isArray(rows)) rows = rows ? [rows] : [];
    return Object.fromEntries(rows.map((r) => [r.letter, r.loadPct]));
  } catch {
    return {};
  }
}

function getDiskTypeMap() {
  try {
    const raw = ps(
      `$phys = @{}
Get-PhysicalDisk -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_.MediaType -eq 'SSD') { $phys[$_.DeviceId] = 'ssd' }
  elseif ($_.MediaType -eq 'HDD') { $phys[$_.DeviceId] = 'hdd' }
  else { $phys[$_.DeviceId] = 'disk' }
}
Get-Partition -ErrorAction SilentlyContinue | Where-Object { $_.DriveLetter } | ForEach-Object {
  $letter = $_.DriveLetter.ToString() + ':'
  $id = $_.DiskNumber.ToString()
  $type = if ($phys.ContainsKey($id)) { $phys[$id] } else { 'disk' }
  [PSCustomObject]@{ letter = $letter; type = $type }
} | ConvertTo-Json -Compress`,
    );
    let rows = JSON.parse(raw || '[]');
    if (!Array.isArray(rows)) rows = rows ? [rows] : [];
    return Object.fromEntries(rows.map((r) => [r.letter, r.type]));
  } catch {
    return {};
  }
}

export function getDisksWindows() {
  try {
    const raw = ps(
      'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object @{N="letter";E={$_.DeviceID}}, @{N="usedPct";E={[int][math]::Round(100*($_.Size-$_.FreeSpace)/$_.Size)}}, @{N="usedGb";E={[math]::Round(($_.Size-$_.FreeSpace)/1GB,1)}}, @{N="totalGb";E={[math]::Round($_.Size/1GB,1)}} | ConvertTo-Json -Compress',
    );
    let disks = JSON.parse(raw || '[]');
    if (!Array.isArray(disks)) disks = disks ? [disks] : [];
    const loads = getDiskLoadMap();
    const types = getDiskTypeMap();
    return disks.map((d) => ({
      ...d,
      type: types[d.letter] ?? (d.letter.startsWith('C') ? 'ssd' : 'hdd'),
      loadPct: loads[d.letter] ?? 0,
    }));
  } catch (e) {
    console.error('[metrics] disks error', e.message);
    return [];
  }
}

function getCpuNode() {
  const curr = sampleCpuTimes();
  const idleDelta = curr.idle - prevCpu.idle;
  const totalDelta = curr.total - prevCpu.total;
  prevCpu = curr;
  if (totalDelta <= 0) return 0;
  return Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100));
}

export function getCpuPercent() {
  if (process.platform === 'win32') {
    const w = getCpuWindows();
    if (w != null) return w;
  }
  return getCpuNode();
}

export function getGpuInfo() {
  if (process.platform === 'win32') {
    return getGpuWindows();
  }
  return { gpu: 0, gpuName: 'GPU', gpuAvailable: false };
}

export function getRamStats() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    ram: Math.min(100, Math.round((used / total) * 100)),
    ramUsedGb: Math.round((used / 1024 ** 3) * 10) / 10,
    ramTotalGb: Math.round((total / 1024 ** 3) * 10) / 10,
  };
}

export function warmupCpuBaseline() {
  prevCpu = sampleCpuTimes();
}

export function collectMetrics() {
  const ram = getRamStats();
  const gpuInfo = getGpuInfo();
  const disks = process.platform === 'win32' ? getDisksWindows() : [];
  return {
    cpu: getCpuPercent(),
    ...gpuInfo,
    ...ram,
    disks,
    ts: Date.now(),
    hostname: os.hostname(),
  };
}
