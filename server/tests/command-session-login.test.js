import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSessionStatus,
  loginCommandSession,
  logoutCommandSession,
  SESSION_COOKIE,
} from '../commands/command-session.js';
import { hashCommandPassword } from '../commands/password-hash.js';

const ORIGINAL = { ...process.env };

function restore() {
  process.env = { ...ORIGINAL };
}

function mockReq({ cookie, method = 'GET', headers = {} } = {}) {
  return {
    method,
    headers: {
      cookie: cookie ? `${SESSION_COOKIE}=${encodeURIComponent(cookie)}` : '',
      ...headers,
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function extractCookieToken(setCookie) {
  const match = setCookie.match(/^pcm_cmd_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

describe('command session login responses', () => {
  before(() => {
    process.env.COMMAND_ADMIN_PASSWORD_HASH = hashCommandPassword('good-pass');
    process.env.COMMAND_SESSION_SECRET = 'test-session-secret-key';
    process.env.NODE_ENV = 'production';
  });

  after(restore);

  it('valid password returns ok and cookie', () => {
    const result = loginCommandSession('good-pass', mockReq({ method: 'POST' }));
    assert.equal(result.ok, true);
    assert.ok(result.cookie);
    assert.match(result.cookie, /pcm_cmd_session=/);
  });

  it('valid password status returns authenticated true with cookie', () => {
    const login = loginCommandSession('good-pass', mockReq({ method: 'POST' }));
    const token = extractCookieToken(login.cookie);
    const status = getSessionStatus(mockReq({ cookie: token }));
    assert.equal(status.authenticated, true);
  });

  it('invalid password returns no cookie', () => {
    const result = loginCommandSession('wrong-pass', mockReq({ method: 'POST' }));
    assert.equal(result.ok, false);
    assert.equal(result.error, 'INVALID_CREDENTIALS');
    assert.equal(result.status, 401);
    assert.equal(result.cookie, undefined);
  });

  it('status without cookie returns authenticated false', () => {
    const status = getSessionStatus(mockReq());
    assert.equal(status.authenticated, false);
  });

  it('logout clears session cookie attributes', () => {
    const login = loginCommandSession('good-pass', mockReq({ method: 'POST' }));
    const token = extractCookieToken(login.cookie);
    const req = mockReq({ cookie: token, method: 'POST' });
    const out = logoutCommandSession(req);
    assert.match(out.cookie, /Max-Age=0/);
    assert.equal(getSessionStatus(req).authenticated, false);
  });
});
