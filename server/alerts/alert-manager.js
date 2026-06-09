import { AlertCooldown } from './cooldown.js';
import { ConnectionHysteresis } from './connection-hysteresis.js';
import { escapeHtml, sendTelegram } from './telegram.js';

export class AlertManager {
  /** @param {import('./telegram-config-store.js').TelegramConfigStore} store */
  constructor(store) {
    this.store = store;
    this.cooldown = new AlertCooldown(Number(process.env.ALERT_COOLDOWN_MS) || 900_000);
    this.connection = new ConnectionHysteresis();
    this.queue = Promise.resolve();
  }

  get configured() {
    const { enabled, botToken, chatId } = this.store.get();
    return Boolean(enabled && botToken && chatId);
  }

  /** @param {string} text */
  enqueue(text) {
    if (!this.configured) return Promise.resolve();
    const { botToken, chatId } = this.store.get();
    this.queue = this.queue
      .then(() => sendTelegram({ token: botToken, chatId, text }))
      .catch((e) => console.error('[alerts]', e.message));
    return this.queue;
  }

  sendTest() {
    if (!this.configured) throw new Error('telegram not configured');
    return this.enqueue('🧪 <b>PC Monitor: тестовое уведомление</b>\nВсё работает!');
  }

  /**
   * @param {{ status: string, changed: boolean, online: boolean, metrics: Record<string, unknown>|null }} ctx
   */
  onStatusChange(ctx) {
    if (!this.configured) return;

    const host = escapeHtml(String(ctx.metrics?.hostname ?? 'PC'));
    const time = new Date().toLocaleString('ru-RU');

    const connectionEvent = this.connection.evaluate(ctx.online);
    if (connectionEvent === 'online') {
      this.enqueue(`🟢 <b>PC Monitor: ПК онлайн</b>\nУстройство: ${host}\nВремя: ${time}`);
    }
    if (connectionEvent === 'offline') {
      this.enqueue(`🔴 <b>PC Monitor: ПК офлайн</b>\nУстройство: ${host}\nВремя: ${time}`);
    }

    if (!ctx.changed || !ctx.online || !ctx.metrics) return;

    const m = ctx.metrics;
    const cpu = m.cpu ?? '—';
    const gpu = m.gpu ?? '—';
    const cpuTemp = m.cpuInfo?.temperature;
    const gpuTemp = m.gpuInfo?.temperature;

    const alerts = {
      overheating: ctx.status === 'overheating',
      'low-memory': ctx.status === 'low-memory',
      'low-disk-space': ctx.status === 'low-disk-space',
      'network-issue': ctx.status === 'network-issue',
      'high-load': ctx.status === 'high-load',
    };

    for (const [type, active] of Object.entries(alerts)) {
      const action = this.cooldown.check(type, active);
      if (action === 'skip') continue;

      if (action === 'recovery') {
        this.enqueue(`✅ <b>PC Monitor: нормализация</b>\nТип: ${escapeHtml(type)}\nУстройство: ${host}\nВремя: ${time}`);
        continue;
      }

      const labels = {
        overheating: '🔥 Перегрев',
        'low-memory': '⚠️ Мало RAM',
        'low-disk-space': '💾 Мало места на диске',
        'network-issue': '🌐 Проблема сети',
        'high-load': '⚡ Высокая нагрузка',
      };

      let extra = `CPU: ${cpu}% · GPU: ${gpu}%`;
      if (cpuTemp != null) extra += `\nCPU temp: ${cpuTemp}°C`;
      if (gpuTemp != null) extra += `\nGPU temp: ${gpuTemp}°C`;

      this.enqueue(
        `<b>PC Monitor: ${labels[type] ?? type}</b>\n` +
          `Устройство: ${host}\n${extra}\n` +
          `Статус: ${escapeHtml(ctx.status)}\nВремя: ${time}`,
      );
    }
  }
}
