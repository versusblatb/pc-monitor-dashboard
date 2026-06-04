export interface VirtualItem {
  id: string;
  height: number;
}

export interface VirtualViewportOptions {
  containerHeight: number;
  overscan?: number;
}

/**
 * Viewport-only rendering for many dashboard cards/charts.
 */
export class ViewportVirtualizer {
  private scrollTop = 0;

  constructor(
    private items: VirtualItem[],
    private readonly options: VirtualViewportOptions,
  ) {}

  setScrollTop(px: number): void {
    this.scrollTop = px;
  }

  setItems(items: VirtualItem[]): void {
    this.items = items;
  }

  getVisibleRange(): { start: number; end: number; offsetY: number } {
    const overscan = this.options.overscan ?? 2;
    const viewH = this.options.containerHeight;
    let offset = 0;
    let start = 0;
    let end = this.items.length;

    for (let i = 0; i < this.items.length; i++) {
      const h = this.items[i].height;
      if (offset + h >= this.scrollTop && start === 0) start = Math.max(0, i - overscan);
      if (offset > this.scrollTop + viewH) {
        end = Math.min(this.items.length, i + overscan);
        break;
      }
      offset += h;
    }

    let offsetY = 0;
    for (let i = 0; i < start; i++) offsetY += this.items[i].height;

    return { start, end, offsetY };
  }
}

export interface LazyMountOptions {
  rootMargin?: string;
  threshold?: number;
}

/**
 * Lazy mount cards/charts when entering viewport.
 */
export function observeLazyMount(
  element: Element,
  onVisible: () => void,
  options: LazyMountOptions = {},
): () => void {
  if (typeof IntersectionObserver === 'undefined') {
    onVisible();
    return () => undefined;
  }

  let mounted = false;
  const io = new IntersectionObserver(
    (entries) => {
      if (mounted) return;
      if (entries.some((e) => e.isIntersecting)) {
        mounted = true;
        onVisible();
        io.disconnect();
      }
    },
    { rootMargin: options.rootMargin ?? '120px', threshold: options.threshold ?? 0.01 },
  );

  io.observe(element);
  return () => io.disconnect();
}
