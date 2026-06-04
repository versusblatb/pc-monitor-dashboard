import type { AdaptiveFeatures } from '../types.js';

/** GPU-safe rules — never enable expensive compositing in production. */
export const GPU_FORBIDDEN = {
  largeBlurPx: 0,
  backdropStack: 0,
  animatedBoxShadow: false,
  expensiveFilters: false,
} as const;

export interface GpuSafeStyleVars {
  '--gpu-glow-opacity': string;
  '--gpu-accent-gradient': string;
  '--gpu-use-blur': string;
  '--gpu-use-shadow-anim': string;
}

export function gpuSafeVars(features: AdaptiveFeatures): GpuSafeStyleVars {
  const glow = features.glowEffects ? '0.35' : '0';
  return {
    '--gpu-glow-opacity': glow,
    '--gpu-accent-gradient':
      features.animatedGradients
        ? 'linear-gradient(135deg, rgba(0,229,255,0.15), rgba(122,92,255,0.12))'
        : 'linear-gradient(180deg, rgba(255,255,255,0.04), transparent)',
    '--gpu-use-blur': features.blurEffects ? '1' : '0',
    '--gpu-use-shadow-anim': '0',
  };
}

export function applyGpuSafeToRoot(root: HTMLElement, features: AdaptiveFeatures): void {
  const vars = gpuSafeVars(features);
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
  root.dataset.gpuSafe = 'true';
  root.classList.toggle('gpu-safe-lite', !features.blurEffects);
}

export const GPU_SAFE_CSS_HINT = `
/* Use transform + opacity only; glow via pseudo gradient overlay */
.gpu-safe-lite .fx-glow {
  box-shadow: none !important;
  filter: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
.gpu-safe-lite .fx-glow::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: var(--gpu-glow-opacity, 0);
  background: var(--gpu-accent-gradient);
  transform: translateZ(0);
}
`;
