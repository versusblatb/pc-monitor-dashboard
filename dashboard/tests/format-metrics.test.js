import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDiskPercent,
  formatFrequency,
  formatNetworkSpeed,
  formatPercent,
  formatPrimaryTemperature,
  formatTemperature,
  formatTemperatureSubtitle,
} from '../src/lib/format-metrics.js';

describe('formatTemperature', () => {
  it('rounds to one decimal with unit', () => {
    assert.equal(formatTemperature(20.466666666666667), '20.5 °C');
  });

  it('returns em dash for invalid values', () => {
    assert.equal(formatTemperature(null), '—');
    assert.equal(formatTemperature(undefined), '—');
    assert.equal(formatTemperature(NaN), '—');
    assert.equal(formatTemperature(Infinity), '—');
    assert.equal(formatTemperature(-Infinity), '—');
  });
});

describe('formatPercent', () => {
  it('rounds usage to integer percent', () => {
    assert.equal(formatPercent(20.466), '20%');
  });

  it('returns em dash for invalid values', () => {
    assert.equal(formatPercent(null), '—');
    assert.equal(formatPercent(NaN), '—');
    assert.equal(formatPercent(Infinity), '—');
  });
});

describe('formatFrequency', () => {
  it('formats GHz with two decimals', () => {
    assert.equal(formatFrequency(3600), '3.60 GHz');
  });

  it('formats sub-GHz as MHz', () => {
    assert.equal(formatFrequency(800), '800 MHz');
  });
});

describe('formatNetworkSpeed', () => {
  it('uses at most one decimal for KB/s', () => {
    assert.equal(formatNetworkSpeed(1536), '1.5 KB/s');
  });

  it('returns em dash for invalid values', () => {
    assert.equal(formatNetworkSpeed(null), '—');
  });
});

describe('formatDiskPercent', () => {
  it('rounds disk percent to integer', () => {
    assert.equal(formatDiskPercent(76.4), '76%');
  });
});

describe('temperature card helpers', () => {
  it('prefers CPU temperature for primary display', () => {
    assert.equal(formatPrimaryTemperature(20.5, 48), '20.5 °C');
  });

  it('falls back to GPU temperature', () => {
    assert.equal(formatPrimaryTemperature(null, 48), '48.0 °C');
  });

  it('shows em dash when both unavailable', () => {
    assert.equal(formatPrimaryTemperature(null, null), '—');
  });

  it('formats subtitle with CPU and GPU labels', () => {
    assert.equal(formatTemperatureSubtitle(20.5, 48), 'CPU 20.5 °C · GPU 48.0 °C');
    assert.equal(formatTemperatureSubtitle(null, 48), 'CPU — · GPU 48.0 °C');
  });
});
