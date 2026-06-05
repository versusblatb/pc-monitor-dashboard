import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StatusResolver } from '../status/status-resolver.js';

describe('StatusResolver', () => {
  it('returns offline when agent offline', () => {
    const r = new StatusResolver({ statusDebounceMs: 0, idleMinutes: 0, highLoadMinutes: 0, gamingMinutes: 0 });
    const { status } = r.resolve({ online: false, metrics: null });
    assert.equal(status, 'offline');
  });

  it('returns low-memory when RAM > 90', () => {
    const r = new StatusResolver({ statusDebounceMs: 0, ramHighThreshold: 90, idleMinutes: 99 });
    const { status } = r.resolve({ online: true, metrics: { cpu: 10, gpu: 5, ram: 95, disks: [] } });
    assert.equal(status, 'low-memory');
  });

  it('returns overheating when CPU temp high', () => {
    const r = new StatusResolver({ statusDebounceMs: 0, cpuTempThreshold: 80, idleMinutes: 99 });
    const { status } = r.resolve({
      online: true,
      metrics: { cpu: 50, gpu: 10, ram: 50, cpuInfo: { temperature: 90 }, disks: [], network: { pingMs: 10, interface: 'eth' } },
    });
    assert.equal(status, 'overheating');
  });
});
