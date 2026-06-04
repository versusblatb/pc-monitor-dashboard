import type { AdaptiveFeatures } from '../types.js';

type RafCallback = (time: number) => void;

/**
 * Throttles rAF to target FPS from adaptive features.
 * Use for particle loops, chart animations, custom canvases.
 */
export class AnimationScaler {
  private targetInterval = 1000 / 60;
  private lastFrame = 0;
  private running = false;
  private callback: RafCallback | null = null;
  private rafId = 0;

  setFeatures(features: AdaptiveFeatures): void {
    this.targetInterval = 1000 / features.animationFps;
  }

  start(callback: RafCallback): void {
    this.stop();
    this.callback = callback;
    this.running = true;
    this.lastFrame = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.callback = null;
  }

  private loop = (time: number): void => {
    if (!this.running || !this.callback) return;

    if (this.lastFrame === 0) {
      this.lastFrame = time;
      this.callback(time);
    } else if (time - this.lastFrame >= this.targetInterval) {
      this.lastFrame = time;
      this.callback(time);
    }

    this.rafId = requestAnimationFrame(this.loop);
  };
}

/** Scale polling interval for realtime data feeds. */
export function scaledRealtimeInterval(
  baseMs: number,
  features: AdaptiveFeatures,
): number {
  return Math.round(baseMs * features.realtimeIntervalMultiplier);
}

/**
 * Batches DOM writes in lite mode via requestAnimationFrame.
 */
export function scheduleDomUpdate(
  fn: () => void,
  features: AdaptiveFeatures,
): void {
  if (!features.minimizeDomUpdates) {
    fn();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(fn));
}
