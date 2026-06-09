import { sendTelegram, sendTelegramPhoto } from '../alerts/telegram.js';

export function createCommandTelegramNotifier(getConfig) {
  return async function notifyCommandAlert(event) {
    if (process.env.TELEGRAM_COMMAND_ALERTS_ENABLED !== 'true') return;
    const cfg = await getConfig();
    if (!cfg?.botToken || !cfg?.chatId) return;

    const { kind, command, hostname, imageBase64 } = event;
    const device = hostname || command?.deviceId || 'unknown';
    const type = command?.type || 'UNKNOWN';
    const status = command?.status || kind;

    if (kind === 'screenshot_photo' && imageBase64) {
      try {
        const buf = Buffer.from(String(imageBase64), 'base64');
        if (buf.length > 0 && buf.length < 10 * 1024 * 1024) {
          await sendTelegramPhoto({
            token: cfg.botToken,
            chatId: cfg.chatId,
            photo: buf,
            caption: `📸 Remote Control\n${device}\n${new Date().toLocaleString('ru-RU')}`,
          });
        }
      } catch (e) {
        console.error('[commands] screenshot telegram failed:', e instanceof Error ? e.message : e);
      }
      return;
    }

    const notifyKinds = new Set([
      'login_failed',
      'replay_detected',
      'invalid_signature',
      'dangerous_succeeded',
      'dangerous_rejected',
      'command_failed',
    ]);
    if (!notifyKinds.has(kind)) return;

    const lines = ['⚠️ Remote Control', `Команда: ${type}`, `Устройство: ${device}`, `Статус: ${status}`];
    if (kind === 'login_failed') lines.push('Событие: неудачный вход');
    if (kind === 'replay_detected') lines.push('Событие: replay attempt');
    if (kind === 'invalid_signature') lines.push('Событие: invalid signature');
    if (kind === 'command_failed') lines.push('Событие: команда не выполнена');

    lines.push(`Время: ${new Date().toISOString()}`);
    await sendTelegram({ token: cfg.botToken, chatId: cfg.chatId, text: lines.join('\n') }).catch(() => {});
  };
}
