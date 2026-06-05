const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || '*';

/** @param {import('http').IncomingMessage} req */
export function validateOrigin(req) {
  if (DASHBOARD_ORIGIN === '*') return true;
  const allowed = DASHBOARD_ORIGIN.split(',').map((s) => s.trim());
  const origin = req.headers.origin;
  const referer = req.headers.referer;
  if (origin && allowed.includes(origin)) return true;
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      if (allowed.includes(refOrigin)) return true;
    } catch {
      return false;
    }
  }
  return false;
}
