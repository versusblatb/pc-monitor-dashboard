import { downsample } from '../history/memory-store.js';

const MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @param {URL} url
 * @param {{
 *   isAgentOnline: () => boolean,
 *   latest: Record<string, unknown>|null,
 *   agentLastSeen: number,
 *   status: string,
 *   history: import('../history/history-manager.js').HistoryManager,
 * }} ctx
 */
export async function handleApiRoute(url, ctx) {
  const path = url.pathname;

  if (path === '/api/metrics' || path === '/api/status') {
    return {
      status: 200,
      body: {
        online: ctx.isAgentOnline(),
        metrics: ctx.latest,
        status: ctx.status,
        stale: !ctx.isAgentOnline(),
        lastSeen: ctx.agentLastSeen || null,
      },
    };
  }

  if (path === '/api/system') {
    return { status: 200, body: { online: ctx.isAgentOnline(), system: ctx.latest?.system ?? null, hostname: ctx.latest?.hostname ?? null } };
  }

  if (path === '/api/processes') {
    return { status: 200, body: { online: ctx.isAgentOnline(), processes: ctx.latest?.processes ?? null } };
  }

  if (path === '/api/disks') {
    return { status: 200, body: { online: ctx.isAgentOnline(), disks: ctx.latest?.disks ?? [] } };
  }

  if (path === '/api/network') {
    return { status: 200, body: { online: ctx.isAgentOnline(), network: ctx.latest?.network ?? null } };
  }

  if (path === '/api/history') {
    const range = url.searchParams.get('range');
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const now = Date.now();
    let from = now - 60 * 60 * 1000;
    let to = now;

    if (range === '24h') from = now - 24 * 60 * 60 * 1000;
    else if (range === '7d') from = now - 7 * 24 * 60 * 60 * 1000;
    else if (range === '1h') from = now - 60 * 60 * 1000;

    if (fromParam) from = Number(fromParam);
    if (toParam) to = Number(toParam);

    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
      return { status: 400, body: { error: 'invalid range' } };
    }
    if (to - from > MAX_RANGE_MS) {
      return { status: 400, body: { error: 'range too large (max 7d)' } };
    }

    const maxPoints = range === '7d' ? 200 : range === '24h' ? 150 : 120;
    const points = await ctx.history.query({ from, to, maxPoints });
    return { status: 200, body: { from, to, points, downsampled: true } };
  }

  return null;
}
