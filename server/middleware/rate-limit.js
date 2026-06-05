const WINDOW_MS = 60_000;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_PER_MIN) || 120;

/** @type {Map<string, { count: number, reset: number }>} */
const buckets = new Map();

/** @param {import('http').IncomingMessage} req @returns {boolean} */
export function rateLimit(req) {
  const ip = req.socket.remoteAddress ?? 'unknown';
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + WINDOW_MS };
    buckets.set(ip, b);
  }
  b.count += 1;
  return b.count <= MAX_REQUESTS;
}
