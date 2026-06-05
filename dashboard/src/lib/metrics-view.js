/** @typedef {'loading'|'unavailable'|'legacy'|'empty'|'value'} MetricState */

/**
 * @param {unknown} value
 * @param {{ online?: boolean, metrics?: Record<string, unknown>|null, schemaVersion?: number }} ctx
 * @param {{ requireV2?: boolean }} [opts]
 */
export function resolveMetricState(value, ctx, opts = {}) {
  const { online = false, metrics = null } = ctx;
  const schemaVersion = metrics?.schemaVersion ?? ctx.schemaVersion ?? null;

  if (!online && metrics == null) return 'loading';
  if (!online && metrics != null) return 'unavailable';
  if (opts.requireV2 && schemaVersion != null && schemaVersion < 2) return 'legacy';
  if (value === null || value === undefined || value === '') {
    if (online && metrics && opts.pendingIfOnline) return 'pending';
    return 'unavailable';
  }
  return 'value';
}

/**
 * @param {Record<string, unknown>|null|undefined} section
 */
export function sectionHasData(section) {
  if (!section || typeof section !== 'object') return false;
  return Object.values(section).some((v) => v !== null && v !== undefined && v !== '');
}

/**
 * @param {Record<string, unknown>|null|undefined} metrics
 * @param {boolean} online
 */
export function resolveProcessesState(metrics, online) {
  const procs = metrics?.processes;
  if (!online && !metrics) return 'loading';
  if (!online) return 'unavailable';
  if (metrics?.schemaVersion != null && metrics.schemaVersion < 2) return 'legacy';
  if (procs == null) return 'pending';
  const total = Number(procs.total);
  if (Number.isFinite(total) && total > 0) return 'ok';
  const topCpu = Array.isArray(procs.topCpu) ? procs.topCpu : [];
  const topMemory = Array.isArray(procs.topMemory) ? procs.topMemory : [];
  if (topCpu.length || topMemory.length) return 'ok';
  return 'empty';
}

/**
 * @param {MetricState|string} state
 * @param {(key: string) => string} t
 */
export function metricHint(state, t) {
  switch (state) {
    case 'loading':
      return t('metricsState.loading');
    case 'pending':
      return t('metricsState.pending');
    case 'legacy':
      return t('metricsState.legacyAgent');
    case 'empty':
      return t('metricsState.empty');
    case 'unavailable':
      return t('metricsState.unavailable');
    default:
      return '';
  }
}

/**
 * @param {unknown} value
 * @param {MetricState|string} state
 * @param {(key: string) => string} t
 */
export function formatMetricValue(value, state, t) {
  if (state === 'value') return value;
  return metricHint(state, t) || '—';
}
