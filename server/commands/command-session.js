import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { hashSensitive } from './crypto-utils.js';
import { verifyCommandPassword } from './password-hash.js';

const SESSION_COOKIE = 'pcm_cmd_session';
const CSRF_HEADER = 'x-csrf-token';
const TTL_MS = (Number(process.env.COMMAND_SESSION_TTL_MINUTES) || 15) * 60_000;
const LOGIN_RATE_LIMIT = Number(process.env.COMMAND_RATE_LIMIT_PER_MINUTE) || 10;
const LOCKOUT_MS = 5 * 60_000;
const MAX_FAILS = 5;

/** @type {Map<string, { count: number, reset: number, lockedUntil: number }>} */
const loginBuckets = new Map();

/** @type {Map<string, { sessionId: string, csrf: string, expiresAt: number }>} */
const sessions = new Map();

function sessionSecret() {
  return process.env.COMMAND_SESSION_SECRET || '';
}

function passwordHash() {
  return process.env.COMMAND_ADMIN_PASSWORD_HASH || '';
}

/** @param {import('http').IncomingMessage} req */
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(rest.join('='));
  }
  return out;
}

/** @param {string} sessionId */
function signSessionId(sessionId) {
  return createHmac('sha256', sessionSecret()).update(sessionId).digest('hex');
}

/** @param {string} token */
function parseSessionToken(token) {
  const idx = token.lastIndexOf('.');
  if (idx < 0) return null;
  const sessionId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = signSessionId(sessionId);
  if (expected.length !== sig.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  return sessionId;
}

/** @param {import('http').IncomingMessage} req */
export function getSessionFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const sessionId = parseSessionToken(token);
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session || Date.now() > session.expiresAt) {
    if (session) sessions.delete(sessionId);
    return null;
  }
  return { sessionId, csrf: session.csrf, expiresAt: session.expiresAt };
}

/** @param {import('http').IncomingMessage} req */
export function validateCsrf(req, session) {
  const header = req.headers[CSRF_HEADER] || req.headers[CSRF_HEADER.toUpperCase()];
  if (!header || !session) return false;
  const a = Buffer.from(String(header));
  const b = Buffer.from(session.csrf);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** @param {string} ip */
function checkLoginRateLimit(ip) {
  const now = Date.now();
  let b = loginBuckets.get(ip);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + 60_000, lockedUntil: 0 };
    loginBuckets.set(ip, b);
  }
  if (b.lockedUntil > now) return false;
  b.count += 1;
  if (b.count > LOGIN_RATE_LIMIT) return false;
  return true;
}

/** @param {string} ip */
function recordLoginFailure(ip) {
  const now = Date.now();
  let b = loginBuckets.get(ip);
  if (!b) b = { count: 0, reset: now + 60_000, lockedUntil: 0 };
  b.failCount = (b.failCount || 0) + 1;
  if (b.failCount >= MAX_FAILS) b.lockedUntil = now + LOCKOUT_MS;
  loginBuckets.set(ip, b);
}

/** @param {string} ip */
function clearLoginFailures(ip) {
  loginBuckets.delete(ip);
}

/**
 * @param {string} password
 * @param {import('http').IncomingMessage} req
 */
export function loginCommandSession(password, req) {
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (!checkLoginRateLimit(ip)) {
    return { ok: false, error: 'RATE_LIMITED', status: 429 };
  }

  const hash = passwordHash();
  if (!hash || !verifyCommandPassword(password, hash)) {
    recordLoginFailure(ip);
    return { ok: false, error: 'INVALID_CREDENTIALS', status: 401 };
  }

  clearLoginFailures(ip);
  const sessionId = randomUUID();
  const csrf = randomBytes(24).toString('hex');
  const expiresAt = Date.now() + TTL_MS;
  sessions.set(sessionId, { sessionId, csrf, expiresAt });

  const token = `${sessionId}.${signSessionId(sessionId)}`;
  const secure = process.env.NODE_ENV === 'production';
  const cookie = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    `Max-Age=${Math.floor(TTL_MS / 1000)}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');

  return { ok: true, csrf, cookie, expiresAt, sessionId };
}

/** @param {import('http').IncomingMessage} req */
export function logoutCommandSession(req) {
  const session = getSessionFromRequest(req);
  if (session) sessions.delete(session.sessionId);
  const secure = process.env.NODE_ENV === 'production';
  const cookie = [
    `${SESSION_COOKIE}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Strict',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
  return { ok: true, cookie };
}

/** @param {import('http').IncomingMessage} req */
export function getSessionStatus(req) {
  const session = getSessionFromRequest(req);
  if (!session) return { active: false };
  return { active: true, expiresAt: session.expiresAt, csrf: session.csrf };
}

export function clearAllSessions() {
  sessions.clear();
}

/** @param {import('http').IncomingMessage} req @param {{ audit?: (e: object) => void }} [opts] */
export function requireCommandSession(req, opts = {}) {
  const session = getSessionFromRequest(req);
  if (!session) return { ok: false, error: 'UNAUTHORIZED', status: 401 };
  if (req.method !== 'GET' && !validateCsrf(req, session)) {
    opts.audit?.({ eventType: 'csrf_rejected', sessionId: session.sessionId });
    return { ok: false, error: 'CSRF_INVALID', status: 403 };
  }
  return { ok: true, session };
}

export { SESSION_COOKIE, CSRF_HEADER, hashSensitive };
