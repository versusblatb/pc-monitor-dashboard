const PREFIX = 'pc-monitor-layout-';

export const CARD_REGISTRY = [
  { id: 'cpu' },
  { id: 'gpu' },
  { id: 'ram' },
  { id: 'temps' },
  { id: 'network' },
  { id: 'disks' },
  { id: 'chart' },
  { id: 'status' },
];

const DEFAULTS = {
  desktop: ['status', 'cpu', 'gpu', 'ram', 'temps', 'disks', 'chart'],
  tablet: ['status', 'cpu', 'gpu', 'ram', 'chart'],
  mobile: ['status', 'cpu', 'ram', 'chart'],
  'command-center': ['status', 'cpu', 'gpu', 'ram', 'temps', 'network', 'disks'],
};

export function getLayout(profile = 'desktop') {
  try {
    const raw = localStorage.getItem(PREFIX + profile);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (validateLayout(parsed)) return parsed;
    }
  } catch {
    /* defaults */
  }
  return {
    cards: DEFAULTS[profile] || DEFAULTS.desktop,
    sizes: {},
  };
}

export function saveLayout(profile, layout) {
  localStorage.setItem(PREFIX + profile, JSON.stringify(layout));
}

export function resetLayout(profile) {
  localStorage.removeItem(PREFIX + profile);
  return getLayout(profile);
}

/** @param {unknown} layout */
export function validateLayout(layout) {
  if (!layout || typeof layout !== 'object') return false;
  // @ts-expect-error loose
  if (!Array.isArray(layout.cards)) return false;
  const known = new Set(CARD_REGISTRY.map((c) => c.id));
  // @ts-expect-error loose
  layout.cards = layout.cards.filter((id) => known.has(id));
  // @ts-expect-error loose
  return layout.cards.length > 0;
}

export function exportLayout(profile) {
  return JSON.stringify(getLayout(profile), null, 2);
}

export function importLayout(profile, json) {
  const parsed = JSON.parse(json);
  if (!validateLayout(parsed)) throw new Error('Invalid layout JSON');
  saveLayout(profile, parsed);
  return parsed;
}
