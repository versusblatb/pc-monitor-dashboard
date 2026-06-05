import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeMetricsState } from '../lib/merge-metrics.js';
import {
  mergeClientMetrics,
  normalizeAgentMessage,
  toClientPayload,
} from '../lib/normalize-metrics.js';

export const MOCK_V2_PAYLOAD = {
  type: 'metrics',
  schemaVersion: 2,
  messageId: 'mock-1',
  timestamp: 1_700_000_000_000,
  payload: {
    hostname: 'IT-DEV',
    agentVersion: '1.0.0',
    schemaVersion: 2,
    ts: 1_700_000_000_000,
    system: {
      manufacturer: 'Dell Inc.',
      model: 'OptiPlex',
      os: 'Microsoft Windows 11 Pro',
      arch: 'x64',
      bios: '1.2.3',
      agentVersion: '1.0.0',
      lastBoot: '2026-06-01T08:00:00.000Z',
    },
    cpu: {
      usage: 22,
      temperature: 54,
      model: 'Intel Core i7',
      physicalCores: 6,
      logicalCores: 12,
      frequencyMhz: 3600,
    },
    gpu: {
      usage: 11,
      temperature: 61,
      model: 'RTX 2060 SUPER',
      vendor: 'NVIDIA',
      memoryUsedMb: 2048,
      memoryTotalMb: 8192,
      available: true,
    },
    memory: { usedPercent: 63, usedGb: 10.1, totalGb: 16 },
    network: {
      interface: 'Ethernet',
      ipv4: '192.0.2.1',
      downloadBps: 1200000,
      uploadBps: 220000,
      pingMs: 14,
      type: 'wired',
      linkSpeedMbps: 1000,
    },
    disks: [{ letter: 'C:', usedPct: 71, usedGb: 120, totalGb: 238, type: 'ssd' }],
    processes: { total: 241, topCpu: [{ name: 'chrome', pid: 1, cpu: 8, memoryPercent: 3 }], topMemory: [] },
    uptime: 7200,
  },
};

describe('mergeMetricsState', () => {
  it('static info survives realtime partial update', () => {
    const full = toClientPayload(normalizeAgentMessage(MOCK_V2_PAYLOAD));
    const partialMsg = {
      type: 'metrics',
      schemaVersion: 2,
      payload: {
        hostname: 'IT-DEV',
        ts: Date.now(),
        cpu: { usage: 40 },
        memory: { usedPercent: 70, usedGb: 11, totalGb: 16 },
        disks: [],
        processes: { total: 0, topCpu: [], topMemory: [] },
      },
    };
    const partial = toClientPayload(normalizeAgentMessage(partialMsg));
    const merged = mergeMetricsState(full, partial);

    assert.equal(merged.system?.manufacturer, 'Dell Inc.');
    assert.equal(merged.cpuInfo?.model, 'Intel Core i7');
    assert.equal(merged.network?.interface, 'Ethernet');
    assert.equal(merged.processes?.total, 241);
  });

  it('undefined does not erase old data', () => {
    const prev = { system: { os: 'Windows 11' }, cpu: 10, schemaVersion: 2 };
    const incoming = { cpu: 20, schemaVersion: 2 };
    const merged = mergeMetricsState(prev, incoming);
    assert.equal(merged.system.os, 'Windows 11');
    assert.equal(merged.cpu, 20);
  });

  it('processes total does not become 0 when section is empty fallback', () => {
    const prev = { processes: { total: 150, topCpu: [{ pid: 1 }], topMemory: [] } };
    const incoming = { processes: { total: 0, topCpu: [], topMemory: [] } };
    const merged = mergeMetricsState(prev, incoming);
    assert.equal(merged.processes.total, 150);
  });
});

describe('normalize mappings', () => {
  it('v2 payload normalizes alternate field names', () => {
    const normalized = normalizeAgentMessage({
      type: 'metrics',
      schemaVersion: 2,
      payload: {
        hostname: 'PC',
        cpu: { brand: 'Ryzen', cores: 16, physical: 8, load: 33 },
        gpu: { controllers: [{ model: 'RX 580', utilizationGpu: 9, temperatureGpu: 70 }] },
        memory: { percent: 55, usedGb: 8, totalGb: 16 },
        networkStats: [{ iface: 'Wi-Fi', rx_sec: 1000, tx_sec: 500, ip4: '10.0.0.2' }],
        processes: { all: 88, topCpu: [], topMemory: [] },
        system: { architecture: 'x64', os: 'Windows 10' },
        disks: [],
        ts: 1,
      },
    });
    const client = toClientPayload(normalized);
    assert.equal(client.cpuInfo.model, 'Ryzen');
    assert.equal(client.cpuInfo.logicalCores, 16);
    assert.equal(client.gpuInfo.model, 'RX 580');
    assert.equal(client.network.interface, 'Wi-Fi');
    assert.equal(client.processes.total, 88);
    assert.equal(client.system.arch, 'x64');
  });

  it('v1 payload normalizes to flat legacy', () => {
    const normalized = normalizeAgentMessage({
      type: 'metrics',
      payload: { cpu: 12, ram: 44, hostname: 'X', ts: 1, disks: [] },
    });
    const client = toClientPayload(normalized);
    assert.equal(client.schemaVersion, 1);
    assert.equal(client.cpu, 12);
    assert.equal(client.cpuInfo, undefined);
  });

  it('mergeClientMetrics keeps nested sections', () => {
    const first = toClientPayload(normalizeAgentMessage(MOCK_V2_PAYLOAD));
    const second = mergeClientMetrics(first, { cpu: 99, schemaVersion: 2, ts: Date.now() });
    assert.equal(second.system?.model, 'OptiPlex');
    assert.equal(second.cpu, 99);
  });
});
