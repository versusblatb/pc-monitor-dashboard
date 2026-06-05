const TELEGRAM_TIMEOUT_MS = 8000;

/**
 * @param {string} token
 * @param {string} method
 * @param {Record<string, unknown>} [body]
 */
async function telegramRequest(token, method, body) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      const desc = data.description || res.statusText || 'Telegram API error';
      throw new Error(desc);
    }
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

/** @param {string} token */
export async function telegramGetMe(token) {
  return telegramRequest(token, 'getMe');
}

/** @param {string} token */
export async function telegramGetUpdates(token) {
  return telegramRequest(token, 'getUpdates', { timeout: 0, limit: 30 });
}

/**
 * @param {Array<Record<string, unknown>>} updates
 */
export function extractChatsFromUpdates(updates) {
  /** @type {Map<string, { id: string, label: string, type: string }>} */
  const chats = new Map();

  for (const update of updates) {
    const chat =
      update.message?.chat ||
      update.edited_message?.chat ||
      update.my_chat_member?.chat ||
      update.chat_member?.chat;

    if (!chat?.id) continue;

    const id = String(chat.id);
    const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || chat.username || id;
    const handle = chat.username ? `@${chat.username}` : null;
    const label = handle ? `${name} (${handle})` : name;

    chats.set(id, { id, label, type: String(chat.type ?? 'private') });
  }

  return [...chats.values()];
}
