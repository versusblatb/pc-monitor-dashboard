import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AlertCooldown } from '../alerts/cooldown.js';

describe('AlertCooldown', () => {
  it('triggers on state transition to active', () => {
    const c = new AlertCooldown(1000);
    assert.equal(c.check('heat', true, 0), 'trigger');
    assert.equal(c.check('heat', true, 0), 'trigger');
  });

  it('sends recovery when normalized', () => {
    const c = new AlertCooldown(0);
    c.check('heat', true, 0);
    assert.equal(c.check('heat', false, 0), 'recovery');
  });
});
