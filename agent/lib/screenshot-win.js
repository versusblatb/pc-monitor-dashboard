import { spawn } from 'node:child_process';

const SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms,System.Drawing
$screen = [Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object Drawing.Bitmap $screen.Width, $screen.Height
$graphics = [Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($screen.Location, [Drawing.Point]::Empty, $screen.Size)
$ms = New-Object IO.MemoryStream
$encoder = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$quality = New-Object Drawing.Imaging.EncoderParameters(1)
$quality.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, 75)
$bmp.Save($ms, $encoder, $quality)
$graphics.Dispose()
$bmp.Dispose()
[Convert]::ToBase64String($ms.ToArray())
`.trim();

/**
 * @param {number} [timeoutMs]
 * @returns {Promise<string>}
 */
export function capturePrimaryScreenJpegBase64(timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', SCRIPT],
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
      const data = stdout.replace(/\s+/g, '');
      if (code !== 0 || !data) {
        reject(new Error(stderr.trim() || 'SCREENSHOT_FAILED'));
        return;
      }
      resolve(data);
    });
  });
}
