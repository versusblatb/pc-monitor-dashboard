import fs from 'node:fs';
import { spawn } from 'node:child_process';

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 60;

const SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$screen = [Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object Drawing.Bitmap $screen.Width, $screen.Height
$graphics = [Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($screen.Location, [Drawing.Point]::Empty, $screen.Size)
$graphics.Dispose()
$maxW = ${MAX_WIDTH}
if ($screen.Width -gt $maxW) {
  $ratio = $maxW / $screen.Width
  $newW = [int]$maxW
  $newH = [int]($screen.Height * $ratio)
  $thumb = New-Object Drawing.Bitmap $newW, $newH
  $g2 = [Drawing.Graphics]::FromImage($thumb)
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.DrawImage($bmp, 0, 0, $newW, $newH)
  $g2.Dispose()
  $bmp.Dispose()
  $bmp = $thumb
}
$path = Join-Path $env:TEMP ("pcm-shot-" + [guid]::NewGuid().ToString("N") + ".jpg")
$encoder = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$quality = New-Object Drawing.Imaging.EncoderParameters(1)
$quality.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, ${JPEG_QUALITY})
$bmp.Save($path, $encoder, $quality)
$bmp.Dispose()
Write-Output $path
`.trim();

/**
 * @param {import('node:child_process').ChildProcess} child
 */
function killProcessTree(child) {
  const pid = child.pid;
  if (!pid) {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
    return;
  }
  spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore',
  }).on('error', () => {
    try {
      child.kill();
    } catch {
      /* ignore */
    }
  });
}

/**
 * @param {number} [timeoutMs]
 * @returns {Promise<{ base64: string, bytes: number }>}
 */
export function capturePrimaryScreenJpegBase64(timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NoLogo', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
      { windowsHide: true },
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      killProcessTree(child);
      finish(reject, new Error('SCREENSHOT_TIMEOUT'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (err) => {
      finish(reject, err);
    });

    child.on('close', (code) => {
      if (settled) return;
      const filePath = stdout.trim().split(/\r?\n/).pop()?.trim();
      if (code !== 0 || !filePath || !fs.existsSync(filePath)) {
        finish(reject, new Error(stderr.trim() || 'SCREENSHOT_FAILED'));
        return;
      }
      try {
        const buf = fs.readFileSync(filePath);
        fs.unlinkSync(filePath);
        finish(resolve, {
          base64: buf.toString('base64'),
          bytes: buf.length,
        });
      } catch (err) {
        finish(reject, err instanceof Error ? err : new Error('SCREENSHOT_READ_FAILED'));
      }
    });
  });
}
