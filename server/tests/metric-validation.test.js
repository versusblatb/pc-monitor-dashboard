import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumber,
  validateTemperature,
  validateUsage,
} from '../lib/metric-validation.js';
import { normalizeV2Payload } from '../lib/normalize-metrics.js';

describe('parseNumber', () => {
  it('converts safe numeric strings', () => {
    assert.equal(parseNumber('42.5'), 42.5);
  });

  it('returns null for NaN and Infinity', () => {
    assert.equal(parseNumber(NaN), null);
    assert.equal(parseNumber(Infinity), null);
    assert.equal(parseNumber('-Infinity'), null);
    assert.equal(parseNumber('not-a-number'), null);
  });
});

describe('validateTemperature', () => {
  it('rounds to one decimal within range', () => {
    assert.equal(validateTemperature(20.466666666666667), 20.5);
  });

  it('rejects out-of-range values', () => {
    assert.equal(validateTemperature(-25), null);
    assert.equal(validateTemperature(200), null);
  });

  it('rejects invalid values', () => {
    assert.equal(validateTemperature(null), null);
    assert.equal(validateTemperature(NaN), null);
    assert.equal(validateTemperature(Infinity), null);
  });
});

describe('validateUsage', () => {
  it('clamps and rounds to 0–100', () => {
    assert.equal(validateUsage(20.466), 20);
    assert.equal(validateUsage(-5), 0);
    assert.equal(validateUsage(150), 100);
  });

  it('returns null for invalid values', () => {
    assert.equal(validateUsage(NaN), null);
    assert.equal(validateUsage(Infinity), null);
  });
});

describe('normalizeV2Payload metric mapping', () => {
  it('maps CPU load to usage, not temperature', () => {
    const { cpu } = normalizeV2Payload({
      cpu: { load: 65, currentLoad: 65 },
    });

    assert.equal(cpu.usage, 65);
    assert.equal(cpu.temperature, null);
  });

  it('maps CPU temperature from temperature fields only', () => {
    const { cpu } = normalizeV2Payload({
      cpu: { usage: 12, temperature: 55.3, load: 12 },
    });

    assert.equal(cpu.usage, 12);
    assert.equal(cpu.temperature, 55.3);
  });

  it('maps GPU utilizationGpu to usage and temperatureGpu to temperature', () => {
    const { gpu } = normalizeV2Payload({
      gpu: { utilizationGpu: 45, temperatureGpu: 48.2 },
    });

    assert.equal(gpu.usage, 45);
    assert.equal(gpu.temperature, 48.2);
  });

  it('does not put GPU usage into temperature', () => {
    const { gpu } = normalizeV2Payload({
      gpu: { utilizationGpu: 72 },
    });

    assert.equal(gpu.usage, 72);
    assert.equal(gpu.temperature, null);
  });
});
