import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSessionFromRequest,
  getSessionStatus,
  loginCommandSession,
  SESSION_COOKIE,
} from '../commands/command-session.js';
import { hashCommandPassword } from '../commands/password-hash.js';
import { requireCommandSession, CSRF_HEADER } from '../commands/command-session.js';

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

describe('command session cookie', () => {
  before(() => {
    process.env.COMMAND_ADMIN_PASSWORD_HASH = hashCommandPassword('test-pass');
    process.env.COMMAND_SESSION_SECRET = 'test-session-secret-key';
    process.env.NODE_ENV = 'production';
  });

  after(restore);

  it('login returns Set-Cookie with required attributes', () => {
    const result = loginCommandSession('test-pass', mockReq({ method: 'POST' }));
    assert.equal(result.ok, true);
    assert.ok(result.cookie);
    assert.match(result.cookie, /HttpOnly/);
    assert.match(result.cookie, /Path=\//);
    assert.match(result.cookie, /SameSite=Lax/);
    assert.match(result.cookie, /Secure/);
    assert.match(result.cookie, /Max-Age=\d+/);
    assert.doesNotMatch(result.cookie, /Domain=/i);
  });

  it('status with cookie returns authenticated true', () => {
    const login = loginCommandSession('test-pass', mockReq({ method: 'POST' }));
    const token = decodeURIComponent(login.cookie.split('=')[1].split(';')[0]);
    const req = mockReq({ cookie: token });
    const status = getSessionStatus(req);
    assert.equal(status.authenticated, true);
    assert.equal(status.active, true);
    assert.ok(status.csrf);
  });

  it('remote-control session check passes with cookie and csrf', () => {
    const login = loginCommandSession('test-pass', mockReq({ method: 'POST' }));
    const token = decodeURIComponent(login.cookie.split('=')[1].split(';')[0]);
    const session = getSessionFromRequest(mockReq({ cookie: token }));
    assert.ok(session);
    const req = mockReq({
      method: 'POST',
      cookie: token,
      headers: { [CSRF_HEADER]: session.csrf },
    });
    const check = requireCommandSession(req);
    assert.equal(check.ok, true);
    assert.notEqual(check.status, 401);
  });

  it('anonymous status returns authenticated false', () => {
    const status = getSessionStatus(mockReq());
    assert.equal(status.authenticated, false);
  });
});
