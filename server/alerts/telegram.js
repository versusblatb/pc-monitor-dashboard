const TELEGRAM_TIMEOUT_MS = 5000;

/** @param {string} text */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {{ token: string, chatId: string, text: string }} opts
 */
export async function sendTelegram({ token, chatId, text }) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Telegram ${res.status}: ${body.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
