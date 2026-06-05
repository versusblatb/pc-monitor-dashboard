import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiUrl } from '../api/client.js';
import { getChartConfig, resolveTier } from '../adaptive.js';

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:3847`;

function wsPath() {
  const base = import.meta.env.DEV && !import.meta.env.VITE_WS_URL
    ? 'ws://127.0.0.1:3847'
    : WS_URL.replace(/^http/, 'ws');
  return `${base}?role=dashboard`;
}

export function useMetrics() {
  const [online, setOnline] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [status, setStatus] = useState('offline');
  const [lastSeen, setLastSeen] = useState(null);
  const [history, setHistory] = useState([]);
  const [hostname, setHostname] = useState('—');
  const historyRef = useRef([]);
  const wsConnectedRef = useRef(false);

  const pushHistory = useCallback((point) => {
    if (!point?.ts) return;
    const last = historyRef.current[historyRef.current.length - 1];
    if (last && last.ts === point.ts) return;

    const tier = resolveTier();
    const { maxPoints } = getChartConfig(tier);
    const next = [...historyRef.current, point].slice(-maxPoints);
    historyRef.current = next;
    setHistory(next);
    setMetrics(point);
    if (point.hostname) setHostname(point.hostname);
    if (point.status) setStatus(point.status);
    if (point.lastSeen) setLastSeen(point.lastSeen);
  }, []);

  const applyPayload = useCallback(
    (payload) => {
      if (!payload) return;
      setOnline(Boolean(payload.online));
      if (payload.status) setStatus(payload.status);
      if (payload.lastSeen) setLastSeen(payload.lastSeen);
      if (payload.metrics) pushHistory({ ...payload.metrics, status: payload.status, lastSeen: payload.lastSeen });
    },
    [pushHistory],
  );

  useEffect(() => {
    let ws = null;
    let pollTimer = null;
    let alive = true;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsPath());
      } catch {
        setWsConnected(false);
        return;
      }

      ws.onopen = () => {
        wsConnectedRef.current = true;
        setWsConnected(true);
      };
      ws.onclose = () => {
        wsConnectedRef.current = false;
        setWsConnected(false);
        setTimeout(() => alive && connectWs(), 3000);
      };
      ws.onerror = () => ws?.close();

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'metrics' && msg.payload) {
            setOnline(true);
            pushHistory(msg.payload);
            if (msg.payload.status) setStatus(msg.payload.status);
            if (msg.payload.lastSeen) setLastSeen(msg.payload.lastSeen);
          }
          if (msg.type === 'status') applyPayload(msg.payload);
          if (msg.type === 'command_update' && msg.payload?.command) {
            window.dispatchEvent(new CustomEvent('pcm-command-update', { detail: msg.payload.command }));
          }
        } catch {
          /* ignore */
        }
      };
    };

    connectWs();

    const pollMs = resolveTier() === 'lite' ? 2500 : 2000;
    pollTimer = setInterval(async () => {
      if (wsConnectedRef.current) return;
      try {
        const data = await api.metrics();
        if (!alive) return;
        applyPayload(data);
      } catch {
        if (alive) setOnline(false);
      }
    }, pollMs);

    return () => {
      alive = false;
      clearInterval(pollTimer);
      ws?.close();
    };
  }, [applyPayload, pushHistory]);

  return { online, wsConnected, metrics, status, lastSeen, history, hostname, stale: !online && metrics != null };
}
