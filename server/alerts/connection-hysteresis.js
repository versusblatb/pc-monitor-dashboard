const ONLINE_ALERT_MS = Number(process.env.ALERT_ONLINE_STABLE_MS) || 60_000;
const OFFLINE_ALERT_MS = Number(process.env.ALERT_OFFLINE_GRACE_MS) || 120_000;

export class ConnectionHysteresis {
  constructor() {
    /** @type {'unknown'|'up'|'down'} */
    this.reported = 'unknown';
    this.onlineSince = 0;
    this.offlineSince = 0;
  }

  /**
   * @param {boolean} online raw socket/metrics online flag
   * @returns {'none'|'online'|'offline'}
   */
  evaluate(online) {
    const now = Date.now();

    if (online) {
      this.offlineSince = 0;
      if (!this.onlineSince) this.onlineSince = now;
      if (this.reported !== 'up' && now - this.onlineSince >= ONLINE_ALERT_MS) {
        this.reported = 'up';
        return 'online';
      }
      return 'none';
    }

    this.onlineSince = 0;
    if (!this.offlineSince) this.offlineSince = now;
    if (this.reported === 'up' && now - this.offlineSince >= OFFLINE_ALERT_MS) {
      this.reported = 'down';
      return 'offline';
    }
    return 'none';
  }
}
