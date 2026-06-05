import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAgentMessage,
  toClientPayload,
} from '../lib/normalize-metrics.js';

describe('normalizeAgentMessage', () => {
  it('accepts legacy v1 flat payload', () => {
    const normalized = normalizeAgentMessage({
      type: 'metrics',
      payload: {
        cpu: 42,
        ram: 61,
        gpu: 10,
        gpuName: 'RTX',
        gpuAvailable: true,
        ramUsedGb: 8,
        ramTotalGb: 16,
        disks: [],
        ts: 1000,
        hostname: 'PC-1',
      },
    });

    assert.equal(normalized?.schemaVersion, 1);
    assert.equal(normalized?.legacy.cpu, 42);
    assert.equal(normalized?.legacy.ram, 61);
  });

  it('accepts schema v2 nested payload', () => {
    const normalized = normalizeAgentMessage({
      type: 'metrics',
      schemaVersion: 2,
      messageId: 'abc',
      timestamp: 2000,
      payload: {
        hostname: 'IT-DEV',
        ts: 2000,
        cpu: { usage: 15, temperature: 55, model: 'Intel', physicalCores: 6, logicalCores: 12, frequencyMhz: 3600 },
        gpu: { usage: 7, temperature: null, model: 'RTX 2060', memoryUsedMb: null, memoryTotalMb: 8192, available: true },
        memory: { usedPercent: 68, usedGb: 10.9, totalGb: 15.9 },
        network: { pingMs: 12 },
        disks: [{ letter: 'C:', usedPct: 76 }],
        processes: { total: 100, topCpu: [], topMemory: [] },
        uptime: 3600,
        system: { os: 'Windows 11', agentVersion: '2.0.0' },
      },
    });

    assert.equal(normalized?.schemaVersion, 2);
    assert.equal(normalized?.legacy.cpu, 15);
    assert.equal(normalized?.legacy.ram, 68);
  });

  it('toClientPayload keeps flat fields for dashboard compat', () => {
    const normalized = normalizeAgentMessage({
      type: 'metrics',
      schemaVersion: 2,
      payload: {
        hostname: 'IT-DEV',
        ts: 3000,
        cpu: { usage: 20 },
        gpu: { usage: 5, model: 'GPU', available: true },
        memory: { usedPercent: 70, usedGb: 11, totalGb: 16 },
        disks: [],
        processes: { total: 0, topCpu: [], topMemory: [] },
        system: { os: 'Win' },
      },
    });

    const client = toClientPayload(normalized);
    assert.equal(client.cpu, 20);
    assert.equal(client.ram, 70);
    assert.equal(client.schemaVersion, 2);
    assert.ok(client.cpuInfo);
    assert.ok(client.system);
  });
});
