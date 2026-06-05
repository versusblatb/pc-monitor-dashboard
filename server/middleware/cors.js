const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || '*';

/** @param {import('http').IncomingMessage} req */
export function corsOrigin(req) {
  const origin = req.headers.origin;
  if (DASHBOARD_ORIGIN === '*') return '*';
  if (origin && (origin === DASHBOARD_ORIGIN || DASHBOARD_ORIGIN.split(',').includes(origin))) {
    return origin;
  }
  return DASHBOARD_ORIGIN;
}

/** @param {import('http').IncomingMessage} req @param {import('http').ServerResponse} res */
export function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin(req));
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Config-Key');
}
