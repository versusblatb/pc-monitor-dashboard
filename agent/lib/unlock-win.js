import { spawn } from 'node:child_process';

/**
 * Attempt to wake display and submit Windows lock-screen password via SendKeys.
 * Works only when the agent runs in the same interactive user session.
 * @param {string} password
 * @param {number} [timeoutMs]
 */
export function unlockWorkstation(password, timeoutMs = 15_000) {
  if (!password) {
    return Promise.reject(new Error('UNLOCK_PASSWORD_NOT_SET'));
  }

  const escaped = password.replace(/'/g, "''");

  const SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
try {
  $pos = [System.Windows.Forms.Cursor]::Position
  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(($pos.X + 2), ($pos.Y + 2))
  Start-Sleep -Milliseconds 200
  [System.Windows.Forms.Cursor]::Position = $pos
  Start-Sleep -Milliseconds 300
  [System.Windows.Forms.SendKeys]::SendWait('${escaped}')
  Start-Sleep -Milliseconds 150
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Write-Output 'unlock_attempted'
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`.trim();

  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
      { windowsHide: true },
    );

    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('UNLOCK_TIMEOUT'));
    }, timeoutMs);

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'UNLOCK_FAILED'));
        return;
      }
      resolve({ message: 'unlock password submitted', method: 'sendkeys' });
    });
  });
}
