import { useCallback, useEffect, useRef, useState } from 'react';
import { getChartConfig, resolveTier } from './adaptive.js';

const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:3847`;

function wsPath() {
  const base = import.meta.env.DEV ? 'ws://127.0.0.1:3847' : WS_URL.replace(/^http/, 'ws');
  return `${base}?role=dashboard`;
}

export function useMetrics() {
  const [online, setOnline] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [metrics, setMetrics] = useState(null);
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
  }, []);

  useEffect(() => {
    let ws = null;
    let pollTimer = null;
    let alive = true;

    const applyStatus = (payload) => {
      if (!alive) return;
      setOnline(Boolean(payload?.online));
      if (payload?.metrics) pushHistory(payload.metrics);
    };

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
          }
          if (msg.type === 'status') {
            applyStatus(msg.payload);
          }
        } catch {
          /* ignore */
        }
      };
    };

    connectWs();

    pollTimer = setInterval(async () => {
      if (wsConnectedRef.current) return;
      try {
        const res = await fetch('/api/metrics');
        const data = await res.json();
        if (!alive) return;
        setOnline(Boolean(data.online));
        if (data.metrics) pushHistory(data.metrics);
      } catch {
        if (alive) setOnline(false);
      }
    }, 2500);

    return () => {
      alive = false;
      clearInterval(pollTimer);
      ws?.close();
    };
  }, [pushHistory]);

  return { online, wsConnected, metrics, history, hostname };
}
