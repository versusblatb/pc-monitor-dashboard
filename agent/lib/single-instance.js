import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCK_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'agent.lock');

/** @param {number} pid */
function isProcessAlive(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Prevent multiple agents fighting for the same server connection.
 * @returns {() => void} release lock
 */
export function acquireAgentLock() {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });

  if (fs.existsSync(LOCK_PATH)) {
    const existing = Number.parseInt(String(fs.readFileSync(LOCK_PATH, 'utf8')).trim(), 10);
    if (isProcessAlive(existing) && existing !== process.pid) {
      console.error(`[agent] already running (pid ${existing}). Stop the other instance first.`);
      process.exit(1);
    }
  }

  fs.writeFileSync(LOCK_PATH, String(process.pid));

  const release = () => {
    try {
      const current = Number.parseInt(String(fs.readFileSync(LOCK_PATH, 'utf8')).trim(), 10);
      if (current === process.pid) fs.unlinkSync(LOCK_PATH);
    } catch {
      /* ignore */
    }
  };

  process.on('exit', release);
  process.on('SIGINT', () => {
    release();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    release();
    process.exit(0);
  });

  return release;
}
