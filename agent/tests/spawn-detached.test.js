import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('launch app handler', () => {
  it('uses cmd start launcher for LAUNCH_APP', () => {
    const handlers = readFileSync(path.join(root, 'commands/handlers.js'), 'utf8');
    const launcher = readFileSync(path.join(root, 'lib/launch-win.js'), 'utf8');
    assert.match(handlers, /launchWindowsApp/);
    assert.match(launcher, /cmd\.exe|ComSpec/);
    assert.match(launcher, /start/);
    assert.doesNotMatch(handlers, /handleLaunchApp[\s\S]*spawnSafe\(app\.executable/);
  });
});
