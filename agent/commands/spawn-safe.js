import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BUFFER = 64 * 1024;

/**
 * @param {string} executable
 * @param {string[]} args
 * @param {{ timeoutMs?: number }} [opts]
 */
export function spawnSafe(executable, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('TIMEOUT'));
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout?.on('data', (d) => {
      stdout += String(d);
      if (stdout.length > MAX_BUFFER) child.kill();
    });
    child.stderr?.on('data', (d) => {
      stderr += String(d);
      if (stderr.length > MAX_BUFFER) child.kill();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}
