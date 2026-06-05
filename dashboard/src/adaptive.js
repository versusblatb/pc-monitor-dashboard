const STORAGE_KEY = 'pc-monitor-perf';

export function getPerfMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'lite' || v === 'full' || v === 'auto') return v;
  } catch {
    /* ignore */
  }
  return 'auto';
}

export function setPerfMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  applyPerfMode(mode);
}

function detectAutoLite() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  const mem = navigator.deviceMemory;
  if (typeof mem === 'number' && mem <= 4) return true;
  const cores = navigator.hardwareConcurrency;
  if (typeof cores === 'number' && cores <= 2) return true;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function resolveTier(mode = getPerfMode()) {
  if (mode === 'lite') return 'lite';
  if (mode === 'full') return 'full';
  return detectAutoLite() ? 'lite' : 'full';
}

export function applyPerfMode(mode = getPerfMode()) {
  if (typeof document === 'undefined') return resolveTier(mode);
  const tier = resolveTier(mode);
  document.documentElement.dataset.perfTier = tier;
  document.documentElement.classList.toggle('perf-lite', tier === 'lite');
  document.documentElement.classList.toggle('perf-full', tier === 'full');
  return tier;
}

export function getChartConfig(tier) {
  if (tier === 'lite') {
    return { maxPoints: 48, updateMs: 2000, animate: false };
  }
  return { maxPoints: 120, updateMs: 1000, animate: true };
}
