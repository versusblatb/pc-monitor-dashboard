import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeSendKeysPassword } from '../lib/unlock-win.js';

describe('escapeSendKeysPassword', () => {
  it('escapes SendKeys special characters', () => {
    assert.equal(escapeSendKeysPassword('a+b'), 'a{+}b');
    assert.equal(escapeSendKeysPassword('362598'), '362598');
  });
});
