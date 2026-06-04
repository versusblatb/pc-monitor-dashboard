# PC Monitor MVP

Рабочий end-to-end продукт: **desktop agent → backend → realtime dashboard**.

Без лишних abstraction layers — три простых пакета в monorepo.

## Что внутри

| Пакет | Порт | Назначение |
|-------|------|------------|
| `server` | 3847 | HTTP API + WebSocket hub |
| `agent` | — | Сбор CPU/RAM с ПК, отправка на server |
| `dashboard` | 5173 | React UI, графики, online/offline, adaptive perf |

## Быстрый старт

```bash
cd c:\Users\IT-DEVELOPER\Documents\My
npm install
npm run dev
```

Откройте **http://localhost:5173**

## Отдельный запуск

```bash
npm run dev -w server    # backend
npm run dev -w agent     # desktop agent (на машине с метриками)
npm run dev -w dashboard # UI
```

## API

- `GET /api/health` — статус сервера и агента
- `GET /api/metrics` — последние метрики + `online`
- `GET /api/stream` — SSE fallback
- `WS /?role=agent` — агент пушит метрики
- `WS /?role=dashboard` — дашборд получает realtime

## Метрики

```json
{
  "cpu": 42,
  "ram": 61,
  "disk": 0,
  "ts": 1710000000000,
  "hostname": "DESKTOP-PC"
}
```

## Dashboard

- **Online/offline** — статус агента + fallback polling
- **Charts** — Recharts CPU/RAM
- **Adaptive** — Auto / Lite / Full (localStorage, iPad/mobile auto-lite)
- **Mobile + iPad** — responsive layout, 44px touch targets, safe areas

## Production build

```bash
npm run build -w dashboard
npm run start -w server
npm run start -w agent
# serve dashboard/dist via nginx or: npm run preview -w dashboard
```

## Переменные окружения

| Var | Default | |
|-----|---------|--|
| `PORT` | 3847 | server port |
| `SERVER_URL` | ws://127.0.0.1:3847?role=agent | agent WS |
| `INTERVAL_MS` | 1000 | agent tick |
| `VITE_WS_URL` | — | dashboard WS override |

## Папка performance-system

Отдельная библиотека (опционально). MVP dashboard использует **простой** `src/adaptive.js` — без platform layers.
