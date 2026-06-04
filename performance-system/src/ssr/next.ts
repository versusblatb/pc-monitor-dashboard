import { isBrowser, isServer } from './guards.js';

/**
 * Next.js App Router — dynamic import heavy chart widgets (no SSR).
 */
export async function dynamicChartImport<T>(
  loader: () => Promise<{ default: T }>,
): Promise<T | null> {
  if (isServer()) return null;
  const mod = await loader();
  return mod.default;
}

export interface LazyHydrationOptions {
  /** Delay hydration until idle (ms). */
  idleMs?: number;
}

/**
 * Defer heavy widget hydration until browser idle.
 */
export function scheduleLazyHydration(
  hydrate: () => void,
  options: LazyHydrationOptions = {},
): () => void {
  if (isServer()) return () => undefined;

  const ms = options.idleMs ?? 0;
  const run = () => {
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(() => hydrate(), { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(hydrate, ms);
    return () => clearTimeout(id);
  };

  return run();
}

/** Props helper: pass to client-only components. */
export function clientOnlyProps(): { suppressHydrationWarning?: boolean } {
  if (isServer()) return { suppressHydrationWarning: true };
  return {};
}

export { isBrowser, isServer };
