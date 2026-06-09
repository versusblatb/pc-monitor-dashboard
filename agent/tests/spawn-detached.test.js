import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('launch app handler', () => {
  it('uses detached spawn for LAUNCH_APP', () => {
    const src = readFileSync(path.join(root, 'commands/handlers.js'), 'utf8');
    assert.match(src, /spawnDetached/);
    assert.doesNotMatch(src, /handleLaunchApp[\s\S]*spawnSafe\(app\.executable/);
  });
});
