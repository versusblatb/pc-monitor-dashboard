import { spawn } from 'node:child_process';

/**
 * Start a GUI/long-running process without waiting for exit.
 * @param {string} executable
 * @param {string[]} [args]
 */
export function spawnDetached(executable, args = []) {
  return new Promise((resolve, reject) => {
    try {
      const child = spawn(executable, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: false,
      });

      child.on('error', reject);

      child.once('spawn', () => {
        child.unref();
        resolve({ pid: child.pid ?? null, code: 0 });
      });
    } catch (err) {
      reject(err);
    }
  });
}
