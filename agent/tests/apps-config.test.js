import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAppById, getPublicAppsList } from '../lib/apps-config.js';

describe('apps config', () => {
  it('exposes only id and label publicly', () => {
    const apps = getPublicAppsList();
    for (const app of apps) {
      assert.ok(app.id);
      assert.ok(app.label);
      assert.equal(app.executable, undefined);
    }
  });

  it('rejects unknown appId', () => {
    assert.equal(getAppById('evil'), null);
  });

  it('allows whitelisted notepad app', () => {
    const app = getAppById('notepad');
    assert.ok(app);
    assert.match(app.executable, /notepad\.exe$/i);
    assert.deepEqual(app.args, []);
  });
});
