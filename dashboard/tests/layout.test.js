import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateLayout } from '../src/layout/layout-store.js';

describe('layout validation', () => {
  it('accepts valid layout', () => {
    assert.equal(validateLayout({ cards: ['cpu', 'gpu', 'ram'] }), true);
  });

  it('rejects unknown cards', () => {
    const layout = { cards: ['cpu', 'unknown-card', 'ram'] };
    assert.equal(validateLayout(layout), true);
    assert.deepEqual(layout.cards, ['cpu', 'ram']);
  });

  it('rejects empty layout', () => {
    assert.equal(validateLayout({ cards: [] }), false);
  });
});
