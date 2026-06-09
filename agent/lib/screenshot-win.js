import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$screen = [Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object Drawing.Bitmap $screen.Width, $screen.Height
$graphics = [Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($screen.Location, [Drawing.Point]::Empty, $screen.Size)
$path = Join-Path $env:TEMP ("pcm-shot-" + [guid]::NewGuid().ToString("N") + ".jpg")
$encoder = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$quality = New-Object Drawing.Imaging.EncoderParameters(1)
$quality.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, 70)
$bmp.Save($path, $encoder, $quality)
$graphics.Dispose()
$bmp.Dispose()
Write-Output $path
`.trim();

/**
 * @param {number} [timeoutMs]
 * @returns {Promise<{ base64: string, bytes: number }>}
 */
export function capturePrimaryScreenJpegBase64(timeoutMs = 25_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NoLogo', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
      { windowsHide: true },
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('SCREENSHOT_TIMEOUT'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const filePath = stdout.trim().split(/\r?\n/).pop()?.trim();
      if (code !== 0 || !filePath || !fs.existsSync(filePath)) {
        reject(new Error(stderr.trim() || 'SCREENSHOT_FAILED'));
        return;
      }
      try {
        const buf = fs.readFileSync(filePath);
        fs.unlinkSync(filePath);
        resolve({
          base64: buf.toString('base64'),
          bytes: buf.length,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('SCREENSHOT_READ_FAILED'));
      }
    });
  });
}
