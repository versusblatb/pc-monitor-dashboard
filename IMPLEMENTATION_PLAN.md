# PC Monitor Dashboard 2.0 — Implementation Plan

> Документ создан перед началом работ. Обновляется по мере выполнения этапов.

## 1. Анализ текущего состояния

### 1.1 Архитектура (работает в production)

```
agent (Windows) ──WS ?role=agent──► server (Render) ──WS ?role=dashboard──► dashboard (Vercel)
                                        │
                                        ├── GET /api/metrics (polling fallback)
                                        ├── GET /api/stream (SSE, не используется UI)
                                        └── GET /api/health
```

| Компонент | Production URL |
|-----------|----------------|
| Backend | `https://pc-monitor-dashboard.onrender.com` |
| WebSocket | `wss://pc-monitor-dashboard.onrender.com` |
| Dashboard | `https://pc-monitor-dashboard-dashboard.vercel.app` |

### 1.2 Текущая схема метрик (schema v1, неформальная)

Агент (`agent/metrics.js`) отправляет плоский payload:

```json
{
  "cpu": 15,
  "gpu": 7,
  "gpuName": "RTX 2060 SUPER",
  "gpuAvailable": true,
  "ram": 68,
  "ramUsedGb": 10.9,
  "ramTotalGb": 15.9,
  "disks": [{ "letter": "C:", "type": "ssd", "usedPct": 76, "loadPct": 0, "usedGb": 337, "totalGb": 446.1 }],
  "ts": 1710000000000,
  "hostname": "IT-DEV"
}
```

Сервер пересылает `{ type: "metrics", payload }` без валидации. README устарел (`disk: 0` вместо `disks[]`).

### 1.3 Зависимости

| Пакет | Зависимости | Отсутствует |
|-------|-------------|-------------|
| `agent` | `ws` | `systeminformation` |
| `server` | `ws` | `pg`, rate-limit, validation |
| `dashboard` | react, recharts, vite, plugin-legacy | react-router, `VITE_API_URL` |
| `performance-system` | полная v2.0 библиотека | **не в workspaces, не подключена** |

### 1.4 Найденные проблемы

| # | Проблема | Риск | Приоритет |
|---|----------|------|-----------|
| P1 | Нет `schemaVersion` — breaking changes сломают production | Высокий | Этап 1 |
| P2 | Агент: только PowerShell/nvidia-smi, нет temp/processes/network | Средний | Этап 1 |
| P3 | `collectMetrics()` без try/catch в `index.js` — падение ломает tick | Высокий | Этап 1 |
| P4 | Reconnect фиксированный 3s/30s, нет exponential backoff | Средний | Этап 1 |
| P5 | Сервер: один snapshot в RAM, нет истории | Высокий | Этап 3 |
| P6 | Dashboard: нет `VITE_API_URL` — production polling на `/api` не работает cross-origin | **Критический** | Этап 5 |
| P7 | SSE `/api/stream` и `/ws` proxy не используются | Низкий | Этап 5 |
| P8 | `performance-system` не интегрирован; MVP `adaptive.js` ~55 строк | Средний | Этапы 5–8 |
| P9 | Нет CORS origin whitelist для production | Средний | Этап 3 |
| P10 | Нет rate limit на HTTP API | Средний | Этап 3 |
| P11 | Дублирующий агент (`npm run start` + `npm run dev`) блокирует подключение | Операционный | README |
| P12 | Git PATH в Cursor (исправлено в settings) | Низкий | — |

### 1.5 Что сохраняем без изменений

- Нативный `ws`, роли `?role=agent` / `?role=dashboard`
- Формат envelope `{ type, payload }` для v1
- Render root `server`, Vercel root `dashboard`
- `@vitejs/plugin-legacy` для iPad/Safari
- Monorepo npm workspaces (расширим при необходимости)
- `performance-system/` как библиотека (интеграция через адаптер, не полная замена MVP)

---

## 2. Целевая схема сообщений (schema v2)

```json
{
  "type": "metrics",
  "schemaVersion": 2,
  "messageId": "uuid-v4",
  "timestamp": 1710000000000,
  "payload": {
    "hostname": "IT-DEV",
    "system": { "manufacturer": null, "model": null, "os": "Windows 11", "arch": "x64", "bios": null, "agentVersion": "2.0.0", "lastBoot": null },
    "cpu": { "usage": 15, "temperature": null, "model": "...", "physicalCores": 6, "logicalCores": 12, "frequencyMhz": 3600 },
    "gpu": { "usage": 7, "temperature": null, "model": "RTX 2060 SUPER", "memoryUsedMb": null, "memoryTotalMb": null, "available": true },
    "memory": { "usedPercent": 68, "usedBytes": null, "totalBytes": null, "usedGb": 10.9, "totalGb": 15.9 },
    "network": { "interface": null, "ipv4": null, "downloadBps": null, "uploadBps": null, "totalDownloaded": null, "totalUploaded": null, "pingMs": null, "type": null, "linkSpeedMbps": null },
    "disks": [],
    "processes": { "total": 0, "topCpu": [], "topMemory": [] },
    "uptime": 86400
  }
}
```

**Backward compatibility:** сервер нормализует v1 → внутренний `NormalizedMetrics` и отдаёт dashboard оба формата через поле `schemaVersion` в API.

---

## 3. Этапы реализации

### Этап 1 — Расширение Windows-агента

**Статус:** ✅ Завершён (базовая реализация)

**Файлы:**

| Действие | Путь |
|----------|------|
| Создать | `agent/config.js` |
| Создать | `agent/collectors/fast.js` |
| Создать | `agent/collectors/medium.js` |
| Создать | `agent/collectors/slow.js` |
| Создать | `agent/collectors/static.js` |
| Создать | `agent/lib/safe.js` |
| Создать | `agent/lib/message.js` |
| Создать | `agent/lib/validate.js` |
| Изменить | `agent/index.js` |
| Изменить | `agent/metrics.js` → legacy wrapper или удалить после миграции |
| Изменить | `agent/package.json` |
| Изменить | `server/lib/normalize-metrics.js` |
| Изменить | `server/index.js` |

**Интервалы сбора:**

| Блок | Интервал | Env |
|------|----------|-----|
| CPU, GPU, RAM | 1s | `INTERVAL_MS=1000` |
| Network, disks | 2.5s | `MEDIUM_INTERVAL_MS=2500` |
| Processes | 5s | `SLOW_INTERVAL_MS=5000` |
| Static system | once + 1h | `STATIC_REFRESH_MS=3600000` |

**Зависимости:** `systeminformation` (+ существующие PowerShell/nvidia-smi как fallback)

**Риски:**

- `systeminformation` temp/SMART может требовать admin → `null`
- Длительные WMI-запросы → таймауты per-block (max 4s)
- Размер WS message → лимит 64KB, обрезка top processes до 10

**Проверка:** `node agent/index.js` локально, `GET /api/metrics` показывает v2 + legacy fields.

---

### Этап 2 — Автоматические статусы

**Статус:** ⏳ Ожидает

**Файлы:**

| Действие | Путь |
|----------|------|
| Создать | `server/config/status-config.js` |
| Создать | `server/status/status-resolver.js` |
| Создать | `server/status/gaming-processes.js` |
| Изменить | `server/index.js` |

**Статусы:** offline, overheating, low-memory, low-disk-space, network-issue, high-load, gaming, idle, online

**Механизм:** hysteresis + debounce (min 30s между сменами, кроме offline)

**API:** `status` в payload metrics/status и `GET /api/status`

**Риски:** ложные gaming alerts → whitelist процессов в config

---

### Этап 3 — История показателей

**Статус:** ⏳ Ожидает

**Файлы:**

| Действие | Путь |
|----------|------|
| Создать | `server/history/memory-store.js` |
| Создать | `server/history/postgres-store.js` |
| Создать | `server/history/history-manager.js` |
| Создать | `server/history/downsampler.js` |
| Создать | `server/migrations/001_history.sql` |
| Создать | `server/scripts/migrate.js` |
| Создать | `server/middleware/cors.js` |
| Создать | `server/middleware/rate-limit.js` |
| Создать | `server/routes/history.js` |
| Создать | `server/routes/system.js` |
| Изменить | `server/index.js` |
| Изменить | `server/package.json` |

**Зависимости:** `pg` (optional)

**Риски:** Render ephemeral FS → Postgres только через `DATABASE_URL`; без БД — MemoryHistoryStore

---

### Этап 4 — Telegram-уведомления

**Статус:** ⏳ Ожидает

**Файлы:**

| Действие | Путь |
|----------|------|
| Создать | `server/alerts/telegram.js` |
| Создать | `server/alerts/alert-manager.js` |
| Создать | `server/alerts/cooldown.js` |
| Создать | `server/.env.example` |
| Изменить | `server/index.js` |

**Риски:** Telegram API блокирует event loop → async queue + timeout 5s

---

### Этап 5 — Новый Dashboard

**Статус:** ⏳ Ожидает

**Файлы:**

| Действие | Путь |
|----------|------|
| Добавить | `react-router-dom` |
| Создать | `dashboard/src/routes/*` |
| Создать | `dashboard/src/pages/Overview.jsx` … |
| Создать | `dashboard/src/api/client.js` (`VITE_API_URL`) |
| Создать | `dashboard/src/hooks/useMetricsV2.js` |
| Создать | `dashboard/src/adapters/performance-system.js` |
| Изменить | `dashboard/src/App.jsx` |
| Изменить | `dashboard/src/useMetrics.js` |
| Изменить | `dashboard/vite.config.js` |

**Критично:** production fetch через `VITE_API_URL`, не `/api`

---

### Этап 6 — Command Center

**Статус:** ⏳ Ожидает

**Файлы:**

| Действие | Путь |
|----------|------|
| Создать | `dashboard/src/pages/CommandCenter.jsx` |
| Создать | `dashboard/src/pages/CommandCenter.css` |
| Маршрут | `/command-center` |

---

### Этап 7 — Темы

**Статус:** ⏳ Ожидает

**Файлы:**

| Действие | Путь |
|----------|------|
| Создать | `dashboard/src/themes/*.css` |
| Создать | `dashboard/src/themes/theme-engine.js` |
| Интеграция | `performance-system/src/rendering/theme-engine.ts` (адаптер) |

---

### Этап 8 — Конструктор карточек

**Статус:** ⏳ Ожидает

**Файлы:**

| Действие | Путь |
|----------|------|
| Создать | `dashboard/src/layout/layout-store.js` |
| Создать | `dashboard/src/layout/LayoutEditor.jsx` |
| Создать | `dashboard/src/layout/card-registry.js` |

**Без тяжёлого DnD:** native HTML5 drag + up/down buttons fallback

---

## 4. Интеграция performance-system

Стратегия: **адаптер**, не полная замена `adaptive.js` на первом проходе.

1. Добавить `performance-system` в workspaces или `file:` dependency
2. `dashboard/src/adapters/performance-system.js` — маппинг `.perf-lite` ↔ `.perf-tier-lite`
3. Подключить transport fallback (WS → SSE → poll) через упрощённый bridge
4. Импортировать `adaptive.css` selectors с shim

Не блокирует этапы 1–4.

---

## 5. Тестирование

| Тест | Путь | Этап |
|------|------|------|
| status-resolver | `server/tests/status-resolver.test.js` | 2 |
| alert cooldown | `server/tests/alert-cooldown.test.js` | 4 |
| schema validation | `agent/tests/validate.test.js` | 1 |
| history downsampling | `server/tests/downsampler.test.js` | 3 |
| layout JSON | `dashboard/tests/layout.test.js` | 8 |
| legacy payload | `server/tests/normalize-metrics.test.js` | 1 |

Runner: Node built-in `node --test` (без Jest overhead).

---

## 6. Environment variables (сводка)

См. `server/.env.example` и `dashboard/.env.example` (создаются на этапах 3–5).

---

## 7. Deploy checklist

### Render (server)

- Root: `server`
- Build: `npm install`
- Start: `npm start`
- Env: `PORT`, `DASHBOARD_ORIGIN`, `DATABASE_URL` (optional), Telegram vars

### Vercel (dashboard)

- Root: `dashboard`
- Build: `npm run build`
- Env: `VITE_WS_URL`, `VITE_API_URL`

### Agent (Windows PC)

- `SERVER_URL=wss://pc-monitor-dashboard.onrender.com?role=agent`
- `start-agent.cmd` или Task Scheduler

---

## 8. Breaking changes

| Изменение | Breaking? | Митигация |
|-----------|-----------|-----------|
| schema v2 payload | Нет | Сервер нормализует v1; dashboard читает оба |
| Новые API routes | Нет | Старые endpoints сохраняются |
| `VITE_API_URL` required in prod | Да (de facto) | Fallback на relative `/api` в dev only |
| `/health` endpoint | Нет | `/api/health` остаётся |

---

## 9. Порядок выполнения (чеклист)

- [x] Анализ репозитория
- [x] IMPLEMENTATION_PLAN.md
- [x] Этап 1: Agent + schema v2 + server normalize
- [x] Этап 2: Status resolver
- [x] Этап 3: History store + API
- [x] Этап 4: Telegram alerts
- [x] Этап 5: Dashboard routes + API client
- [x] Этап 6: Command Center
- [x] Этап 7: Themes
- [x] Этап 8: Layout editor
- [x] Тесты
- [x] README + CHANGELOG
- [x] lint/test/build verification

---

## 10. Журнал прогресса

| Дата | Этап | Результат |
|------|------|-----------|
| 2026-06-05 | 0 | Анализ + план |
| 2026-06-05 | 1 | Agent v2, systeminformation, server normalize, tests |
