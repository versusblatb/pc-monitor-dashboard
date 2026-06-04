import type { FpsSample } from '../types.js';

const LOW_FPS_THRESHOLD = 28;

export function isLowFps(sample: FpsSample): boolean {
  return sample.average < LOW_FPS_THRESHOLD;
}

/**
 * Measures animation frame rate over `durationMs` using rAF.
 * Safe to call in background tabs (may return low FPS — intended).
 */
export function probeFps(durationMs = 1500): Promise<FpsSample> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'undefined') {
      resolve({
        average: 60,
        min: 60,
        samples: 0,
        durationMs: 0,
      });
      return;
    }

    const deltas: number[] = [];
    let last = performance.now();
    let min = Infinity;
    const start = last;

    const tick = (now: number) => {
      const delta = now - last;
      if (last > 0 && delta > 0 && delta < 500) {
        deltas.push(delta);
        const fps = 1000 / delta;
        if (fps < min) min = fps;
      }
      last = now;

      if (now - start >= durationMs) {
        finish(now - start);
        return;
      }
      requestAnimationFrame(tick);
    };

    const finish = (elapsed: number) => {
      if (deltas.length === 0) {
        resolve({ average: 60, min: 60, samples: 0, durationMs: elapsed });
        return;
      }
      const fpsValues = deltas.map((d) => 1000 / d);
      const average =
        fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length;
      resolve({
        average: Math.round(average * 10) / 10,
        min: Math.round(min * 10) / 10,
        samples: deltas.length,
        durationMs: elapsed,
      });
    };

    requestAnimationFrame(tick);

    // Fallback if rAF stalls
    setTimeout(() => {
      if (deltas.length === 0) finish(durationMs);
    }, durationMs + 200);
  });
}
