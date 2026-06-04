import { execSync } from 'node:child_process';

const PORT = process.env.PORT || 3847;

function killPort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"`,
        { encoding: 'utf8' },
      ).trim();
      const pids = out.split(/\s+/).filter(Boolean);
      for (const pid of pids) {
        if (pid && pid !== '0') {
          console.log(`[dev] stopping process ${pid} on port ${port}`);
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
        shell: true,
        stdio: 'ignore',
      });
    }
  } catch {
    /* port free */
  }
}

killPort(PORT);
execSync(
  'npx concurrently -n server,agent,dashboard -c blue,green,magenta "npm run dev -w server" "npm run dev -w agent" "npm run dev -w dashboard"',
  { stdio: 'inherit', shell: true },
);
