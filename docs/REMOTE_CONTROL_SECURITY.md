# Remote Control Security

## Threat model

| Threat | Mitigation |
|--------|------------|
| Public internet triggers shutdown | Command session password + short TTL cookie + CSRF + Origin check |
| Stolen dashboard access | No agent token in browser; commands signed server-side |
| Forged commands to agent | HMAC-SHA256 + TTL + deviceId + nonce replay cache |
| Arbitrary shell execution | Whitelist enum only; fixed spawn() executables; no user strings in shell |
| Replay attacks | Agent stores last 500 command IDs/nonces; idempotency keys on server |
| Credential leakage in logs | Tokens/passwords/signatures never logged |
| Screenshot exfiltration | Off by default; short TTL; no Telegram; no audit image content |

## Trust boundaries

1. **Dashboard** — operator UI only; holds session cookie + CSRF in sessionStorage
2. **Server** — validates operator, signs commands, queues in PostgreSQL
3. **Agent** — verifies signature, executes fixed handlers

## Authentication flow

1. Agent opens WebSocket `?role=agent` (no token in URL)
2. Agent sends `agent_auth` with `AGENT_AUTH_TOKEN`
3. Server constant-time compare; responds `agent_auth_result`
4. Metrics ignored until authenticated
5. Operator logs in via `POST /api/command-session/login` → HttpOnly cookie

## Signing flow

Server signs: `id|deviceId|type|canonicalParams|createdAt|expiresAt|nonce|version`

Agent verifies with `COMMAND_SIGNING_SECRET` before execution.

## Kill switches

| Switch | Effect |
|--------|--------|
| `COMMANDS_ENABLED=false` | Server rejects new commands |
| `ALLOW_REMOTE_COMMANDS=false` | Agent ignores `remote_command` |
| `agent/data/disable-remote-control` file | Agent ignores commands locally |
| Production without PostgreSQL | Commands auto-disabled |

## Secret rotation

1. Set `COMMANDS_ENABLED=false`
2. Rotate `AGENT_AUTH_TOKEN`, `COMMAND_SIGNING_SECRET`, `COMMAND_SESSION_SECRET`
3. Update agent env and redeploy
4. Regenerate `COMMAND_ADMIN_PASSWORD_HASH`
5. Re-enable commands

## Emergency disable

Render: `COMMANDS_ENABLED=false` → redeploy

Local PC: create `agent/data/disable-remote-control` or set `ALLOW_REMOTE_COMMANDS=false` and restart agent.

## Incident response

- Review `command_audit_log` export via `GET /api/remote-control/audit`
- Revoke sessions: rotate `COMMAND_SESSION_SECRET`
- Invalidate pending commands: they expire by TTL automatically
