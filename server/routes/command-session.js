import {
  getSessionStatus,
  loginCommandSession,
  logoutCommandSession,
} from '../commands/command-session.js';
import { AuditStore } from '../commands/audit-store.js';
import { readJsonBody } from '../lib/read-body.js';
import { validateOrigin } from '../middleware/origin-guard.js';

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {URL} url
 * @param {import('../commands/command-manager.js').CommandManager} commands
 * @param {(res: import('http').ServerResponse, req: import('http').IncomingMessage, status: number, body: object) => void} json
 */
export async function handleCommandSessionRoute(req, res, url, commands, json) {
  const path = url.pathname;

  if (path === '/api/command-session/status' && req.method === 'GET') {
    const avail = commands.availability();
    json(res, req, 200, {
      ...getSessionStatus(req),
      enabled: avail.enabled,
      reason: avail.reason,
    });
    return true;
  }

  if (path === '/api/command-session/login' && req.method === 'POST') {
    if (!validateOrigin(req)) {
      json(res, req, 403, { error: 'origin not allowed' });
      return true;
    }
    const avail = commands.availability();
    if (!avail.enabled) {
      json(res, req, 403, { error: 'commands disabled', reason: avail.reason });
      return true;
    }
    try {
      const body = await readJsonBody(req);
      const result = loginCommandSession(String(body.password ?? ''), req);
      if (!result.ok) {
        await commands.audit.append({
          eventType: 'login_failed',
          actorType: 'operator',
          safeMetadata: {},
          ...AuditStore.metaFromRequest(req),
        });
        json(res, req, result.status ?? 401, { error: 'invalid credentials' });
        return true;
      }
      res.setHeader('Set-Cookie', result.cookie);
      json(res, req, 200, { ok: true, csrf: result.csrf, expiresAt: result.expiresAt });
    } catch {
      json(res, req, 400, { error: 'invalid request' });
    }
    return true;
  }

  if (path === '/api/command-session/logout' && req.method === 'POST') {
    if (!validateOrigin(req)) {
      json(res, req, 403, { error: 'origin not allowed' });
      return true;
    }
    const result = logoutCommandSession(req);
    res.setHeader('Set-Cookie', result.cookie);
    json(res, req, 200, { ok: true });
    return true;
  }

  return false;
}
