export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function isServer(): boolean {
  return !isBrowser();
}

export function safeWindow<T>(fn: () => T, fallback: T): T {
  if (isServer()) return fallback;
  return fn();
}

export function safeMatchMedia(
  query: string,
  fallback = false,
): boolean {
  if (isServer()) return fallback;
  return window.matchMedia(query).matches;
}
