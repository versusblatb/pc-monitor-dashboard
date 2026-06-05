import { requireCommandSession } from '../commands/command-session.js';
import { readJsonBody } from '../lib/read-body.js';
import { validateOrigin } from '../middleware/origin-guard.js';

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {URL} url
 * @param {import('../commands/command-manager.js').CommandManager} commands
 * @param {(res: import('http').ServerResponse, req: import('http').IncomingMessage, status: number, body: object) => void} json
 */
export async function handleRemoteControlRoute(req, res, url, commands, json) {
  const path = url.pathname;
  if (!path.startsWith('/api/remote-control/')) return false;

  if (req.method === 'POST' && !validateOrigin(req)) {
    json(res, req, 403, { error: 'origin not allowed' });
    return true;
  }

  const avail = commands.availability();

  const session = requireCommandSession(req, {
    audit: (e) => commands.audit.append({ ...e, eventType: 'csrf_rejected', actorType: 'operator' }),
  });

  if (!session.ok) {
    json(res, req, session.status ?? 401, { error: session.error });
    return true;
  }

  if (!avail.enabled) {
    json(res, req, 403, { error: 'commands disabled', reason: avail.reason });
    return true;
  }

  if (path === '/api/remote-control/capabilities' && req.method === 'GET') {
    json(res, req, 200, commands.getCapabilities());
    return true;
  }

  if (path === '/api/remote-control/apps' && req.method === 'GET') {
    const caps = commands.getAgentInfo()?.capabilities;
    const apps = caps?.apps ?? [];
    json(res, req, 200, { apps });
    return true;
  }

  if (path === '/api/remote-control/commands' && req.method === 'GET') {
    const list = await commands.store.list({ limit: 50 });
    json(res, req, 200, { commands: list.map((c) => commands.publicCommand(c)) });
    return true;
  }

  if (path === '/api/remote-control/commands' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const result = await commands.createCommand(body, req);
      json(res, req, result.status ?? (result.ok ? 201 : 400), result.ok
        ? { command: result.command, duplicate: result.duplicate ?? false }
        : { error: result.error });
    } catch {
      json(res, req, 400, { error: 'invalid request' });
    }
    return true;
  }

  const cmdMatch = path.match(/^\/api\/remote-control\/commands\/([^/]+)$/);
  if (cmdMatch) {
    const id = cmdMatch[1];
    if (req.method === 'GET') {
      const cmd = await commands.store.getById(id);
      if (!cmd) {
        json(res, req, 404, { error: 'not found' });
        return true;
      }
      json(res, req, 200, { command: commands.publicCommand(cmd) });
      return true;
    }
    if (req.method === 'POST' && url.pathname.endsWith('/cancel')) {
      // handled below
    }
  }

  const cancelMatch = path.match(/^\/api\/remote-control\/commands\/([^/]+)\/cancel$/);
  if (cancelMatch && req.method === 'POST') {
    const result = await commands.cancelCommand(cancelMatch[1], req);
    json(res, req, result.status ?? (result.ok ? 200 : 400), result.ok
      ? { command: result.command }
      : { error: result.error });
    return true;
  }

  if (path === '/api/remote-control/audit' && req.method === 'GET') {
    const format = url.searchParams.get('format') || 'json';
    if (format === 'csv') {
      const csv = await commands.audit.export({ format: 'csv' });
      res.writeHead(200, { 'Content-Type': 'text/csv' });
      res.end(csv);
      return true;
    }
    const rows = await commands.audit.list({ limit: 100 });
    json(res, req, 200, { audit: rows });
    return true;
  }

  return false;
}
