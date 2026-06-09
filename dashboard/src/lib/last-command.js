const STORAGE_KEY = 'pcm-last-command';

/** @param {object|null} command */
export function saveLastCommand(command) {
  if (!command?.id) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      id: command.id,
      type: command.type,
      status: command.status,
      errorCode: command.errorCode ?? null,
      createdAt: command.createdAt,
      completedAt: command.completedAt ?? null,
      result: command.result?.pid != null
        ? { pid: command.result.pid, appId: command.result.appId, message: command.result.message }
        : null,
      updatedAt: Date.now(),
    }));
    window.dispatchEvent(new CustomEvent('pcm-last-command', { detail: command }));
  } catch {
    /* ignore quota */
  }
}

/** @returns {object|null} */
export function loadLastCommand() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
