/**
 * Mobile Safari: passive listeners, avoid layout thrashing helpers.
 */

export function installPassiveScrollListeners(root: EventTarget = document): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const opts: AddEventListenerOptions = { passive: true, capture: true };
  const noop = () => undefined;

  root.addEventListener('touchstart', noop, opts);
  root.addEventListener('touchmove', noop, opts);
  root.addEventListener('wheel', noop, opts);
  root.addEventListener('scroll', noop, opts);

  return () => {
    root.removeEventListener('touchstart', noop, opts);
    root.removeEventListener('touchmove', noop, opts);
    root.removeEventListener('wheel', noop, opts);
    root.removeEventListener('scroll', noop, opts);
  };
}

/** Prefer compositor-only updates (Safari-friendly). */
export function applyCompositorStyle(el: HTMLElement): void {
  el.style.willChange = 'transform, opacity';
  el.style.transform = 'translateZ(0)';
}

export function clearCompositorStyle(el: HTMLElement): void {
  el.style.willChange = '';
  el.style.transform = '';
}

/**
 * Batch reads then writes to avoid layout thrashing.
 */
export function batchedDomUpdate(
  read: () => void,
  write: () => void,
): void {
  read();
  requestAnimationFrame(() => {
    write();
  });
}
