# Metrics Schema v2

Unified contract between **agent → server → dashboard**.

## WebSocket envelope

```json
{
  "type": "metrics",
  "schemaVersion": 2,
  "messageId": "uuid",
  "timestamp": 1700000000000,
  "payload": { }
}
```

## Payload (canonical)

```json
{
  "hostname": "IT-DEV",
  "agentVersion": "1.0.0",
  "schemaVersion": 2,
  "ts": 1700000000000,
  "uptime": 7200,
  "system": {
    "manufacturer": "Dell Inc.",
    "model": "OptiPlex 7090",
    "os": "Microsoft Windows 11 Pro 23H2",
    "arch": "x64",
    "bios": "1.18.0",
    "agentVersion": "1.0.0",
    "lastBoot": "2026-06-01T08:00:00.000Z"
  },
  "cpu": {
    "usage": 22,
    "temperature": 54,
    "model": "Intel Core i7-10700",
    "manufacturer": "Intel",
    "physicalCores": 8,
    "logicalCores": 16,
    "frequencyMhz": 3600,
    "maxSpeedMhz": 4800
  },
  "gpu": {
    "usage": 11,
    "temperature": 61,
    "model": "RTX 2060 SUPER",
    "vendor": "NVIDIA",
    "memoryUsedMb": 2048,
    "memoryTotalMb": 8192,
    "available": true
  },
  "memory": {
    "usedPercent": 63,
    "usedBytes": 10844792422,
    "totalBytes": 17179869184,
    "usedGb": 10.1,
    "totalGb": 16
  },
  "network": {
    "interface": "Ethernet",
    "ipv4": "192.0.2.10",
    "downloadBps": 1200000,
    "uploadBps": 220000,
    "totalDownloaded": 9876543210,
    "totalUploaded": 1234567890,
    "pingMs": 14,
    "type": "wired",
    "linkSpeedMbps": 1000
  },
  "disks": [
    {
      "letter": "C:",
      "mount": "C:",
      "type": "ssd",
      "usedPct": 71,
      "usedPercent": 71,
      "usedGb": 120,
      "totalGb": 238,
      "loadPct": 4
    }
  ],
  "processes": {
    "total": 241,
    "topCpu": [
      { "name": "chrome", "pid": 1234, "cpu": 8.2, "memoryBytes": 512000000, "memoryPercent": 3.1 }
    ],
    "topMemory": [
      { "name": "Code", "pid": 5678, "cpu": 1.1, "memoryBytes": 890000000, "memoryPercent": 5.4 }
    ]
  }
}
```

## Server client shape (`latest` / `/api/metrics`)

```json
{
  "schemaVersion": 2,
  "agentVersion": "1.0.0",
  "hostname": "IT-DEV",
  "cpu": 22,
  "gpu": 11,
  "ram": 63,
  "system": { },
  "cpuInfo": { },
  "gpuInfo": { },
  "memoryInfo": { },
  "network": { },
  "processes": { },
  "disks": [ ]
}
```

## Field aliases accepted on ingest

| Canonical | Aliases |
|-----------|---------|
| `system.arch` | `architecture` |
| `cpu.model` | `brand` |
| `cpu.logicalCores` | `cores` |
| `cpu.physicalCores` | `physical` |
| `cpu.usage` | `load` |
| `gpu.usage` | `utilizationGpu` |
| `network` | `networkStats[]` |
| `processes.total` | `all` |
| `disks` | `fsSize` |

## Merge rules (server)

- New non-empty fields update state
- Missing static sections are preserved from previous snapshot
- `undefined` ignored; `null` means explicitly unavailable
- `disks` replaced only when a non-empty array arrives
- Empty `processes: { total: 0, topCpu: [], topMemory: [] }` does not wipe a previously known process count

## Excluded from payload

- serial numbers
- process command lines
- absolute file paths
- usernames
