# PC Monitor Dashboard 2.0

Agent → Backend (Render) → Dashboard (Vercel). Monorepo npm workspaces.

## Production

| Service | URL |
|---------|-----|
| Backend | https://pc-monitor-dashboard.onrender.com |
| WebSocket | wss://pc-monitor-dashboard.onrender.com |
| Dashboard | https://pc-monitor-dashboard-dashboard.vercel.app |

## Local start

```bash
npm install
npm run dev
```

- Dashboard: http://localhost:5173
- Server: http://localhost:3847
- Command Center: http://localhost:5173/command-center

## Agent only (Windows PC)

```bash
set SERVER_URL=wss://pc-monitor-dashboard.onrender.com?role=agent
npm run start -w agent
```

Or double-click `start-agent.cmd`.

## Env

See `server/.env.example` and `dashboard/.env.example`.

**Vercel:** `VITE_WS_URL`, `VITE_API_URL`  
**Render:** `PORT`, `DASHBOARD_ORIGIN`, optional `DATABASE_URL`, Telegram vars

## API

- `GET /api/metrics` / `/api/status` — realtime + status
- `GET /api/history?range=1h|24h|7d`
- `GET /api/system`, `/api/processes`, `/api/disks`, `/api/network`
- `GET /health`, `GET /api/stream` (SSE)
- `WS ?role=agent|dashboard`

## PostgreSQL (optional)

```bash
DATABASE_URL=postgres://... npm run migrate -w server
```

## Telegram

1. Create bot via @BotFather → `TELEGRAM_BOT_TOKEN`
2. Get chat id → `TELEGRAM_CHAT_ID`
3. Render env: `TELEGRAM_ALERTS_ENABLED=true`

## Remote control (optional, disabled by default)

Whitelist-only commands: Lock, Sleep, Hibernate, Shutdown, Restart, Launch/Stop approved apps, Clear temp, Screenshot.

**Security:** no arbitrary shell; HMAC-signed commands; agent token via `agent_auth` message; operator password session.

### Generate secrets

```bash
# Command admin password hash (Render: COMMAND_ADMIN_PASSWORD_HASH)
npm run hash-command-password -w server -- "your-strong-password"

# Agent token + signing secret (use openssl or Node crypto random bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Render env

```
COMMANDS_ENABLED=true
COMMAND_ADMIN_PASSWORD_HASH=<scrypt hash>
COMMAND_SESSION_SECRET=<random>
COMMAND_SIGNING_SECRET=<random>
AGENT_AUTH_TOKEN=<random>
DATABASE_URL=<required in production>
TELEGRAM_COMMAND_ALERTS_ENABLED=true
```

### Agent env (`agent/.env.example`)

```
AGENT_AUTH_TOKEN=<same as Render>
COMMAND_SIGNING_SECRET=<same as Render>
ALLOW_REMOTE_COMMANDS=true
ALLOW_SCREENSHOT=false
COMMAND_EXECUTION_MODE=mock
```

### Mock mode (safe local testing)

Set `COMMAND_EXECUTION_MODE=mock` on the agent — power commands return success without executing.

Emergency disable: `COMMANDS_ENABLED=false` on Render, or create `agent/data/disable-remote-control`.

Dashboard: `/remote-control` — requires command session login.

See `docs/REMOTE_CONTROL_SECURITY.md` and `docs/REMOTE_CONTROL_PLAN.md`.

## Tests

```bash
npm test -w server
npm test -w agent
npm test -w dashboard
npm run build -w dashboard
```

## Deploy

**Render:** Root `server`, Build `npm install`, Start `npm start`  
**Vercel:** Root `dashboard`, Build `npm run build`

See `IMPLEMENTATION_PLAN.md` and `CHANGELOG.md` for details.
