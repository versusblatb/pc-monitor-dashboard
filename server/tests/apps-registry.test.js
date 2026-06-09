import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AppsRegistry, validateAppEntry } from '../commands/apps-registry.js';

describe('validateAppEntry', () => {
  it('accepts safe absolute exe path', () => {
    const result = validateAppEntry({
      id: 'notepad',
      label: 'Notepad',
      executable: 'C:\\Windows\\System32\\notepad.exe',
      allowStop: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.app.id, 'notepad');
  });

  it('rejects relative executable', () => {
    assert.equal(validateAppEntry({ id: 'x', executable: 'notepad.exe' }).ok, false);
  });

  it('rejects script extensions', () => {
    assert.equal(validateAppEntry({
      id: 'evil',
      executable: 'C:\\Windows\\System32\\evil.bat',
    }).ok, false);
  });
});

describe('AppsRegistry', () => {
  /** @type {string} */
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `remote-apps-${Date.now()}.json`);
  });

  afterEach(() => {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  });

  it('persists and reloads apps', () => {
    const registry = new AppsRegistry(tmpFile);
    const result = registry.replaceAll([{
      id: 'calc',
      label: 'Calculator',
      executable: 'C:\\Windows\\System32\\calc.exe',
      allowStop: true,
    }]);
    assert.equal(result.ok, true);
    assert.equal(result.apps.length, 1);

    const reloaded = new AppsRegistry(tmpFile);
    assert.equal(reloaded.listPublic()[0].id, 'calc');
  });

  it('rejects duplicate ids', () => {
    const registry = new AppsRegistry(tmpFile);
    const result = registry.replaceAll([
      { id: 'a', executable: 'C:\\Windows\\System32\\notepad.exe' },
      { id: 'a', executable: 'C:\\Windows\\System32\\calc.exe' },
    ]);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'DUPLICATE_APP_ID');
  });
});
