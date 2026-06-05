# Changelog

## 2.0.0 — 2026-06-05

### Agent
- Schema v2 metrics with systeminformation
- Staggered collectors (1s / 2.5s / 5s / static)
- Exponential backoff reconnect, graceful shutdown
- Process list without sensitive fields

### Server
- Status resolver (idle, gaming, overheating, etc.)
- Memory history store + optional PostgreSQL
- Telegram alerts with cooldown
- New API: `/api/history`, `/api/system`, `/api/processes`, `/api/disks`, `/api/network`, `/api/status`
- CORS, rate limit, legacy payload compatibility

### Dashboard
- React Router sections: Overview, Hardware, Processes, Storage, Network, History, Settings
- Command Center at `/command-center`
- Theme engine (6 themes)
- Layout editor with localStorage profiles
- `VITE_API_URL` for production cross-origin API
