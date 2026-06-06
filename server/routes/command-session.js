import {
  getSessionStatus,
  loginCommandSession,
  logoutCommandSession,
} from '../commands/command-session.js';
import { AuditStore } from '../commands/audit-store.js';
import { readJsonBody } from '../lib/read-body.js';
import { validateOrigin } from '../middleware/origin-guard.js';

/** @param {string} code @param {string} message */
function errorBody(code, message) {
  return { ok: false, error: { code, message } };
}

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
    const status = getSessionStatus(req);
    console.log(
      '[commands] session status:',
      status.authenticated ? 'authenticated' : 'anonymous',
    );
    json(res, req, 200, {
      authenticated: Boolean(status.authenticated),
      expiresAt: status.expiresAt ?? null,
      csrf: status.authenticated ? status.csrf : undefined,
      enabled: avail.enabled,
      reason: avail.reason,
    });
    return true;
  }

  if (path === '/api/command-session/login' && req.method === 'POST') {
    if (!validateOrigin(req)) {
      console.warn('[commands] origin rejected');
      json(res, req, 403, errorBody('ORIGIN_REJECTED', 'Запрос отклонён системой безопасности.'));
      return true;
    }

    const avail = commands.availability();
    if (!avail.enabled) {
      json(res, req, 503, errorBody('COMMANDS_DISABLED', 'Удалённое управление отключено.'));
      return true;
    }

    try {
      const body = await readJsonBody(req);
      const result = loginCommandSession(String(body.password ?? ''), req);

      if (!result.ok) {
        if (result.error === 'RATE_LIMITED') {
          console.warn('[commands] login rejected: rate_limited');
          await commands.audit.append({
            eventType: 'login_failed',
            actorType: 'operator',
            safeMetadata: { reason: 'rate_limited' },
            ...AuditStore.metaFromRequest(req),
          });
          json(res, req, 429, errorBody('TOO_MANY_ATTEMPTS', 'Слишком много попыток. Попробуйте позже.'));
          return true;
        }

        console.warn('[commands] login rejected: invalid_credentials');
        await commands.audit.append({
          eventType: 'login_failed',
          actorType: 'operator',
          safeMetadata: { reason: 'invalid_credentials' },
          ...AuditStore.metaFromRequest(req),
        });
        json(res, req, 401, errorBody('INVALID_CREDENTIALS', 'Неверный пароль'));
        return true;
      }

      console.log('[commands] login success');
      console.log('[commands] session cookie issued');
      res.setHeader('Set-Cookie', result.cookie);
      json(res, req, 200, {
        ok: true,
        authenticated: true,
        expiresAt: new Date(result.expiresAt).toISOString(),
      });
    } catch {
      json(res, req, 400, errorBody('INVALID_REQUEST', 'Некорректный запрос.'));
    }
    return true;
  }

  if (path === '/api/command-session/logout' && req.method === 'POST') {
    if (!validateOrigin(req)) {
      json(res, req, 403, errorBody('ORIGIN_REJECTED', 'Запрос отклонён системой безопасности.'));
      return true;
    }
    const result = logoutCommandSession(req);
    console.log('[commands] session logout');
    res.setHeader('Set-Cookie', result.cookie);
    json(res, req, 200, { ok: true, authenticated: false });
    return true;
  }

  return false;
}
