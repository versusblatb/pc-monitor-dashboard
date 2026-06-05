# Remote Control Implementation Plan

## Scope

Secure whitelist-only remote commands from dashboard to a single Windows agent.
No arbitrary shell, no Socket.IO, no secrets in frontend bundle.

## Trust boundaries

| Zone | Trust |
|------|-------|
| Dashboard (Vercel) | Untrusted operator UI; command session required |
| Server (Render) | Validates session, signs commands, queues in PostgreSQL |
| Agent (user PC) | Verifies signature, TTL, replay; executes fixed handlers only |

## Phases

1. **Command types & validation** — `server/commands/command-types.js`, `command-schema.js`
2. **Crypto** — scrypt password hash, HMAC command signing, constant-time compare
3. **Agent auth** — `agent_auth` first message; metrics blocked until ok
4. **PostgreSQL** — `remote_commands`, `command_audit_log` (migration 003)
5. **Command manager** — create, deliver, ack, result, expire, idempotency
6. **HTTP API** — session login/logout + remote-control endpoints with CSRF/Origin
7. **WebSocket** — `remote_command` to agent; `command_update` to dashboards
8. **Agent executor** — mock mode default; Windows handlers behind `ALLOW_REMOTE_COMMANDS`
9. **Dashboard UI** — `/remote-control` with confirmations and timeline
10. **Telegram** — optional command alerts via `TELEGRAM_COMMAND_ALERTS_ENABLED`
11. **Tests** — enum, signing, replay, session, mock agent E2E

## Kill switches

- Server: `COMMANDS_ENABLED=false`
- Agent: `ALLOW_REMOTE_COMMANDS=false` or `agent/data/disable-remote-control` file
- Production without PostgreSQL: commands auto-disabled

## Default off

- `COMMANDS_ENABLED=false`
- `ALLOW_REMOTE_COMMANDS=false`
- `ALLOW_SCREENSHOT=false`
- `COMMAND_EXECUTION_MODE=mock` (non-production)
