import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

/** Escape special SendKeys characters: +^%~[]{}() */
export function escapeSendKeysPassword(password) {
  return String(password).replace(/[+^%~[\]{}()]/g, (ch) => `{${ch}}`);
}

const UNLOCK_SCRIPT = `
param([string]$Password)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms,System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativePower {
  [DllImport("kernel32.dll", CharSet=CharSet.Auto, SetLastError=true)]
  public static extern uint SetThreadExecutionState(uint esFlags);
}
"@

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NativeSas {
  [DllImport("sas.dll", SetLastError=true)]
  public static extern void SendSAS(bool AsUser);
}
"@

function Wake-Display {
  [void][NativePower]::SetThreadExecutionState(0x80000003)
  $pos = [System.Windows.Forms.Cursor]::Position
  [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(($pos.X + 3), ($pos.Y + 3))
  Start-Sleep -Milliseconds 120
  [System.Windows.Forms.Cursor]::Position = $pos
  Start-Sleep -Milliseconds 200
}

function Test-LockScreenActive {
  return $null -ne (Get-Process -Name 'LogonUI' -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Send-UnlockKeys([string]$Text) {
  [System.Windows.Forms.SendKeys]::SendWait(' ')
  Start-Sleep -Milliseconds 350
  [System.Windows.Forms.Application]::DoEvents()
  [System.Windows.Forms.SendKeys]::SendWait($Text)
  Start-Sleep -Milliseconds 120
  [System.Windows.Forms.Application]::DoEvents()
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  [System.Windows.Forms.Application]::DoEvents()
}

try {
  Wake-Display
  $locked = Test-LockScreenActive

  if ($locked) {
    try {
      [NativeSas]::SendSAS($false)
      Start-Sleep -Milliseconds 500
    } catch {
      Write-Warning 'SAS_UNAVAILABLE'
    }
  }

  Send-UnlockKeys -Text $Password

  if ($locked) {
    Start-Sleep -Milliseconds 800
    if (Test-LockScreenActive) {
      Write-Error 'LOCK_SCREEN_STILL_ACTIVE'
      exit 3
    }
  }

  Write-Output 'unlock_attempted'
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
`.trim();

/**
 * @param {string} password
 * @param {number} [timeoutMs]
 */
export function unlockWorkstation(password, timeoutMs = 12_000) {
  if (!password) {
    return Promise.reject(new Error('UNLOCK_PASSWORD_NOT_SET'));
  }

  const escaped = escapeSendKeysPassword(password);
  const scriptPath = path.join(os.tmpdir(), `pcm-unlock-${Date.now()}.ps1`);
  fs.writeFileSync(scriptPath, UNLOCK_SCRIPT, 'utf8');

  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-STA',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        '-Password',
        escaped,
      ],
      { windowsHide: true },
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      reject(new Error('UNLOCK_TIMEOUT'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });

    child.on('error', (err) => {
      clearTimeout(timer);
      try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }

      if (code === 3 || stderr.includes('LOCK_SCREEN_STILL_ACTIVE')) {
        reject(new Error('LOCK_SCREEN_SECURE: enable SoftwareSASGeneration=3 (see agent docs)'));
        return;
      }
      if (code !== 0 || !stdout.includes('unlock_attempted')) {
        reject(new Error(stderr.trim() || 'UNLOCK_FAILED'));
        return;
      }
      resolve({
        message: 'unlock password submitted',
        method: stderr.includes('SAS_UNAVAILABLE') ? 'sendkeys_no_sas' : 'sendkeys_sas',
      });
    });
  });
}
