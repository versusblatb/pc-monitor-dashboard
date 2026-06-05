import { sendTelegram } from '../alerts/telegram.js';

export function createCommandTelegramNotifier(getConfig) {
  return async function notifyCommandAlert(event) {
    if (process.env.TELEGRAM_COMMAND_ALERTS_ENABLED !== 'true') return;
    const cfg = await getConfig();
    if (!cfg?.botToken || !cfg?.chatId) return;

    const { kind, command, hostname } = event;
    const device = hostname || command?.deviceId || 'unknown';
    const type = command?.type || 'UNKNOWN';
    const status = command?.status || kind;

    const lines = ['⚠️ Remote Control', `Команда: ${type}`, `Устройство: ${device}`, `Статус: ${status}`];
    if (kind === 'login_failed') lines.push('Событие: неудачный вход');
    if (kind === 'replay_detected') lines.push('Событие: replay attempt');
    if (kind === 'invalid_signature') lines.push('Событие: invalid signature');

    lines.push(`Время: ${new Date().toISOString()}`);
    await sendTelegram({ token: cfg.botToken, chatId: cfg.chatId, text: lines.join('\n') }).catch(() => {});
  };
}
