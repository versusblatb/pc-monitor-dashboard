# Realtime Dashboard Platform

Enterprise-grade adaptive performance for **realtime PC metrics dashboards** (WebSocket / SSE / polling).

## Architecture

```
RealtimeDashboardPlatform
├── PerformanceManager      # tier, detection, feature pipeline
├── DashboardRuntime        # scheduler, health, visibility
├── TransportManager        # WS → SSE → polling fallback
├── BatteryAdaptiveMode     # low battery → lite
├── ThermalGuard            # unstable FPS → thermal lite
├── MetricsCacheLayer       # session cache + stale indicator
├── OfflineStateManager     # offline UX + reconnect
├── MemoryWatchdog          # heap pressure recovery
├── SafariCrashGuard        # bfcache / legacy recovery
├── AdaptiveChartEngine     # lite SVG vs full animated
├── AdaptiveThemeEngine     # lite flat vs cyberpunk
└── DebugOverlay            # dev HUD (?perf-debug=1)
```

## Quick start

```ts
import { RealtimeDashboardPlatform } from '@app/adaptive-performance';

const platform = await RealtimeDashboardPlatform.create({
  endpoints: {
    websocket: 'wss://api/metrics',
    sse: 'https://api/metrics/stream',
    polling: 'https://api/metrics/poll',
  },
  storageKey: 'pc-metrics',
  devMode: true,
});

await platform.init();
platform.connect();
```

## React (Next.js safe)

```tsx
import {
  RealtimeDashboardProvider,
  useAdaptiveRealtime,
  useAdaptiveChartData,
  useDashboardSnapshot,
} from '@app/adaptive-performance/react';
import { dynamicChartImport, scheduleLazyHydration } from '@app/adaptive-performance';

// app/dashboard/page.tsx — client component
<RealtimeDashboardProvider platformOptions={{ endpoints: { ... } }}>
  <Dashboard />
</RealtimeDashboardProvider>

// Lazy chart (no SSR)
scheduleLazyHydration(() => setChartReady(true));
const Chart = await dynamicChartImport(() => import('./MetricsChart'));
```

## Transport fallback

1. WebSocket (primary)
2. SSE after repeated WS failures
3. Polling as last resort  
Exponential **ReconnectBackoff** on all transports.

## Power modes

| Mode | Trigger | Effect |
|------|---------|--------|
| Battery | `<20%` not charging | Lite tier cap, slower WS, no advanced charts |
| Thermal | FPS variance + low avg | 20 FPS, chart redraw 2.5s+ |
| Health | UI FPS `<28` | Temporary lite 45s |

## GPU-safe rendering

Never: large blur, backdrop stacks, animated `box-shadow`, heavy filters.  
Always: `transform`, `opacity`, CSS variables, gradient overlays.

## Debug overlay

`?perf-debug=1` or `localStorage.setItem('perf-debug','1')` — FPS, WS latency, memory, tier, transport, tab visibility.

## Build

```bash
npm install && npm run build
```
