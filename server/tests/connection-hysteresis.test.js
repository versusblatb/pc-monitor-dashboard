import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionHysteresis } from '../alerts/connection-hysteresis.js';

describe('ConnectionHysteresis', () => {
  it('does not alert on brief disconnects', () => {
    const h = new ConnectionHysteresis();
    h.onlineSince = Date.now() - 120_000;
    h.reported = 'up';
    h.offlineSince = Date.now() - 5_000;
    assert.equal(h.evaluate(false), 'none');
  });

  it('alerts offline only after grace period', () => {
    const h = new ConnectionHysteresis();
    h.onlineSince = Date.now() - 120_000;
    h.reported = 'up';
    h.offlineSince = Date.now() - 130_000;
    assert.equal(h.evaluate(false), 'offline');
  });
});
