import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  COMMAND_API_BASE,
  commandFetch,
  resolveCommandUrl,
} from '../src/api/command-client.js';
import { resolveLoginErrorMessage } from '../src/hooks/useCommandSession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, '../src');

const REMOTE_FILES = [
  'api/command-client.js',
  'hooks/useCommandSession.js',
  'pages/RemoteControl.jsx',
];

const FORBIDDEN = [
  /VITE_API_URL/,
  /onrender\.com/,
  /\/api\/command-session/,
  /\/api\/remote-control/,
  /api\.commandSession/,
  /from ['"]\.\.\/api\/client/,
];

function fakeT(key) {
  const map = {
    'remote.errors.invalidCredentials': 'Неверный пароль',
    'remote.errors.tooManyAttempts': 'Слишком много попыток. Попробуйте позже.',
    'remote.errors.network': 'Не удалось подключиться к серверу.',
    'remote.loginFailed': 'Login failed',
  };
  return map[key] ?? key;
}

describe('command-client base URL', () => {
  it('uses same-origin /backend-api only', () => {
    assert.equal(COMMAND_API_BASE, '/backend-api');
  });

  it('commandFetch uses /backend-api with credentials include', async () => {
    let captured = null;
    const original = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      captured = { url, opts };
      return {
        ok: true,
        json: async () => ({ authenticated: false }),
      };
    };
    try {
      await commandFetch('/command-session/status');
      assert.equal(captured.url, '/backend-api/command-session/status');
      assert.equal(captured.opts.credentials, 'include');
      assert.doesNotMatch(captured.url, /onrender/);
      assert.doesNotMatch(captured.url, /^https?:/);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('rejects absolute or legacy API paths', () => {
    assert.throws(() => resolveCommandUrl('https://pc-monitor-dashboard.onrender.com/api/command-session/status'));
    assert.throws(() => resolveCommandUrl('/api/command-session/status'));
  });
});

describe('remote control source guard', () => {
  for (const rel of REMOTE_FILES) {
    it(`${rel} has no forbidden absolute API patterns`, () => {
      const src = readFileSync(path.join(SRC_DIR, rel), 'utf8');
      const patterns = rel === 'api/command-client.js'
        ? FORBIDDEN.filter((p) => !['/onrender\\.com/', '/\\/api\\/command-session/', '/\\/api\\/remote-control/'].includes(String(p)))
        : FORBIDDEN;
      for (const pattern of patterns) {
        assert.doesNotMatch(src, pattern, `forbidden ${pattern} in ${rel}`);
      }
      if (rel.includes('RemoteControl') || rel.includes('useCommandSession')) {
        assert.match(src, /\/backend-api|command-client|commandFetch\('\/remote-control/);
      }
    });
  }
});

describe('login error messages', () => {
  it('maps INVALID_CREDENTIALS to user message', () => {
    const err = new Error('x');
    err.code = 'INVALID_CREDENTIALS';
    err.status = 401;
    assert.equal(resolveLoginErrorMessage(err, fakeT), 'Неверный пароль');
  });

  it('maps 429 to too many attempts', () => {
    const err = new Error('x');
    err.code = 'TOO_MANY_ATTEMPTS';
    err.status = 429;
    assert.match(resolveLoginErrorMessage(err, fakeT), /попыток/);
  });

  it('maps network TypeError', () => {
    assert.match(resolveLoginErrorMessage(new TypeError('fetch failed'), fakeT), /подключиться/);
  });
});

describe('RemoteControl login UX', () => {
  it('prevents default submit and avoids reload', () => {
    const src = readFileSync(path.join(__dirname, '../src/pages/RemoteControl.jsx'), 'utf8');
    assert.match(src, /onSubmit=\{handleLoginSubmit\}/);
    assert.match(src, /event\.preventDefault\(\)/);
    assert.doesNotMatch(src, /window\.location\.reload/);
    assert.match(src, /role="alert"/);
    assert.match(src, /loginState === 'submitting'/);
    assert.match(src, /sessionState === 'authenticated'/);
    assert.doesNotMatch(src, /useMetrics\(\)[\s\S]*checkStatus/);
  });

  it('loads protected data only when authenticated', () => {
    const src = readFileSync(path.join(__dirname, '../src/pages/RemoteControl.jsx'), 'utf8');
    assert.match(src, /if \(!isAuthenticated\)/);
    assert.match(src, /clearProtectedData/);
    assert.doesNotMatch(src, /session\.active/);
    assert.match(src, /from '\.\.\/api\/command-client\.js'/);
    assert.doesNotMatch(src, /\[isAuthenticated, session\]/);
  });
});

describe('useCommandSession mount behavior', () => {
  it('status effect runs once on mount without metrics dependency', () => {
    const src = readFileSync(path.join(__dirname, '../src/hooks/useCommandSession.js'), 'utf8');
    assert.match(src, /initDoneRef/);
    assert.doesNotMatch(src, /useMetrics/);
    assert.doesNotMatch(src, /metrics/);
    assert.doesNotMatch(src, /online/);
    assert.doesNotMatch(src, /wsConnected/);
    assert.match(src, /background: true/);
    assert.doesNotMatch(src, /sessionStorage/);
    assert.doesNotMatch(src, /setLoading\(true\)/);
  });
});

describe('vercel.json proxy rewrite', () => {
  it('rewrites /backend-api before SPA fallback', () => {
    const vercel = JSON.parse(readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));
    assert.equal(vercel.rewrites[0].source, '/backend-api/:path*');
    assert.match(vercel.rewrites[0].destination, /onrender\.com\/api\//);
    assert.equal(vercel.rewrites[1].destination, '/index.html');
  });
});
