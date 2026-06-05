export class AlertCooldown {
  /**
   * @param {number} defaultMs
   */
  constructor(defaultMs = 900_000) {
    this.defaultMs = defaultMs;
    /** @type {Map<string, number>} */
    this.lastSent = new Map();
    /** @type {Map<string, boolean>} */
    this.active = new Map();
  }

  /**
   * @param {string} type
   * @param {boolean} isActive
   * @param {number} [cooldownMs]
   * @returns {'trigger'|'recovery'|'skip'}
   */
  check(type, isActive, cooldownMs = this.defaultMs) {
    const wasActive = this.active.get(type) ?? false;
    this.active.set(type, isActive);

    if (isActive && !wasActive) {
      if (this.canSend(type, cooldownMs)) {
        this.markSent(type);
        return 'trigger';
      }
      return 'skip';
    }

    if (!isActive && wasActive) {
      if (this.canSend(`${type}:recovery`, cooldownMs)) {
        this.markSent(`${type}:recovery`);
        return 'recovery';
      }
      return 'skip';
    }

    if (isActive && wasActive) {
      if (this.canSend(type, cooldownMs)) {
        this.markSent(type);
        return 'trigger';
      }
    }

    return 'skip';
  }

  /** @param {string} type @param {number} ms */
  canSend(type, ms) {
    const last = this.lastSent.get(type) ?? 0;
    return Date.now() - last >= ms;
  }

  /** @param {string} type */
  markSent(type) {
    this.lastSent.set(type, Date.now());
  }
}
