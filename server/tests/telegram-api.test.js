import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractChatsFromUpdates } from '../alerts/telegram-api.js';

describe('extractChatsFromUpdates', () => {
  it('extracts private chats from messages', () => {
    const chats = extractChatsFromUpdates([
      {
        update_id: 1,
        message: {
          chat: { id: 12345, first_name: 'Alex', username: 'alex', type: 'private' },
        },
      },
    ]);
    assert.equal(chats.length, 1);
    assert.equal(chats[0].id, '12345');
    assert.match(chats[0].label, /Alex/);
    assert.match(chats[0].label, /@alex/);
  });

  it('deduplicates chats', () => {
    const chats = extractChatsFromUpdates([
      { message: { chat: { id: 99, first_name: 'A', type: 'private' } } },
      { message: { chat: { id: 99, first_name: 'A', type: 'private' } } },
    ]);
    assert.equal(chats.length, 1);
  });
});
