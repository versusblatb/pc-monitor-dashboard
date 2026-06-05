import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { handleAgentAuth, initAgentConnection, isAgentAuthenticated } from '../commands/agent-auth.js';

const ORIGINAL = { ...process.env };

function restore() {
  process.env = { ...ORIGINAL };
}

describe('agent auth', () => {
  beforeEach(restore);

  it('rejects missing token in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AGENT_AUTH_TOKEN = 'secret-token';
    const ws = { close: () => {}, readyState: 1 };
    initAgentConnection(ws);
    const result = handleAgentAuth(ws, { token: 'wrong', hostname: 'PC' });
    assert.equal(result.ok, false);
    assert.equal(isAgentAuthenticated(ws), false);
  });

  it('accepts valid token', () => {
    process.env.NODE_ENV = 'production';
    process.env.AGENT_AUTH_TOKEN = 'secret-token';
    const ws = { close: () => {}, readyState: 1 };
    initAgentConnection(ws);
    const result = handleAgentAuth(ws, {
      token: 'secret-token',
      hostname: 'IT-DEV',
      agentVersion: '2.0.0',
      capabilities: { lock: true },
    });
    assert.equal(result.ok, true);
    assert.ok(result.deviceId);
    assert.equal(isAgentAuthenticated(ws), true);
  });

  it('allows local dev bypass without token', () => {
    process.env.NODE_ENV = 'development';
    process.env.AGENT_AUTH_TOKEN = '';
    const ws = { close: () => {}, readyState: 1 };
    initAgentConnection(ws);
    assert.equal(isAgentAuthenticated(ws), true);
  });
});
