import { extractChatsFromUpdates, telegramGetMe, telegramGetUpdates } from '../alerts/telegram-api.js';
import { TelegramConfigStore } from '../alerts/telegram-config-store.js';

/**
 * @param {import('node:http').IncomingMessage} req
 */
export async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @param {import('../alerts/alert-manager.js').AlertManager} alerts
 * @param {TelegramConfigStore} store
 * @param {(res: import('node:http').ServerResponse, req: import('node:http').IncomingMessage, status: number, body: unknown) => void} json
 */
export async function handleAlertsRoute(req, res, url, alerts, store, json) {
  if (url.pathname === '/api/alerts/status' && req.method === 'GET') {
    json(res, req, 200, store.getPublicStatus());
    return true;
  }

  if (url.pathname === '/api/alerts/config' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const key = TelegramConfigStore.readConfigKey(req);
      const result = await store.save(
        {
          enabled: body.enabled,
          botToken: body.botToken,
          chatId: body.chatId,
        },
        key,
      );
      json(res, req, 200, result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const status = message === 'invalid config key' || message === 'config locked by server env' ? 403 : 400;
      json(res, req, status, { error: message });
    }
    return true;
  }

  if (url.pathname === '/api/alerts/bot-info' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const token = String(body.botToken ?? '').trim();
      if (!token) {
        json(res, req, 400, { error: 'botToken required' });
        return true;
      }
      const me = await telegramGetMe(token);
      json(res, req, 200, {
        ok: true,
        username: me.username,
        firstName: me.first_name,
        botLink: me.username ? `https://t.me/${me.username}` : null,
      });
    } catch (e) {
      json(res, req, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (url.pathname === '/api/alerts/discover-chat' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const token = String(body.botToken ?? store.get().botToken ?? '').trim();
      if (!token) {
        json(res, req, 400, { error: 'botToken required' });
        return true;
      }
      const updates = await telegramGetUpdates(token);
      const chats = extractChatsFromUpdates(updates);
      if (!chats.length) {
        json(res, req, 404, {
          error: 'no chats found',
          hint: 'send /start to your bot in Telegram, then try again',
        });
        return true;
      }
      json(res, req, 200, { chats });
    } catch (e) {
      json(res, req, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (url.pathname === '/api/alerts/test' && req.method === 'POST') {
    const key = TelegramConfigStore.readConfigKey(req);
    if (!store.assertConfigKey(key)) {
      json(res, req, 403, { error: 'invalid config key' });
      return true;
    }
    if (!alerts.configured) {
      json(res, req, 400, { error: 'telegram not configured' });
      return true;
    }
    try {
      await alerts.sendTest();
      json(res, req, 200, { ok: true });
    } catch (e) {
      json(res, req, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  if (url.pathname === '/api/alerts/test' && req.method === 'GET') {
    const secret = url.searchParams.get('secret');
    const expected = process.env.ALERT_TEST_SECRET;
    if (!expected || !secret || secret !== expected) {
      json(res, req, 403, { error: 'forbidden' });
      return true;
    }
    if (!alerts.configured) {
      json(res, req, 400, { error: 'telegram not configured' });
      return true;
    }
    try {
      await alerts.sendTest();
      json(res, req, 200, { ok: true });
    } catch (e) {
      json(res, req, 400, { error: e instanceof Error ? e.message : String(e) });
    }
    return true;
  }

  return false;
}
