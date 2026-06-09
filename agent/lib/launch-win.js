import { spawn } from 'node:child_process';

/**
 * Launch a Windows GUI app via `cmd /c start` (reliable for notepad, calc, etc.).
 * @param {string} executable Absolute path to .exe
 * @param {string[]} [args]
 */
export function launchWindowsApp(executable, args = []) {
  return new Promise((resolve, reject) => {
    const comspec = process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
    const spawnArgs = ['/d', '/c', 'start', '""', executable, ...args];

    const child = spawn(comspec, spawnArgs, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      try {
        child.unref();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    child.on('spawn', () => done({ pid: child.pid ?? null, launched: true }));
    setTimeout(() => done({ pid: child.pid ?? null, launched: true }), 1000);
  });
}
