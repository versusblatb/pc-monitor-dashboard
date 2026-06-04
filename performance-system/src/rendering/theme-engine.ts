import type { ThemeTokens } from '../platform/types.js';
import type { PerformanceTier } from '../types.js';

export function themeForTier(tier: PerformanceTier): ThemeTokens {
  if (tier === 'lite') {
    return {
      glowIntensity: 0.15,
      blurAllowed: false,
      backdropBlurPx: 0,
      gradientAnimated: false,
      transparencyLevel: 'opaque',
      accentAnimation: false,
      depthShadows: false,
    };
  }

  return {
    glowIntensity: 0.55,
    blurAllowed: false,
    backdropBlurPx: 0,
    gradientAnimated: true,
    transparencyLevel: 'balanced',
    accentAnimation: true,
    depthShadows: true,
  };
}

export function applyThemeToRoot(root: HTMLElement, theme: ThemeTokens): void {
  root.style.setProperty('--theme-glow', String(theme.glowIntensity));
  root.style.setProperty('--theme-blur-px', `${theme.backdropBlurPx}px`);
  root.dataset.themeTier = theme.transparencyLevel;
  root.classList.toggle('theme-cyberpunk', theme.accentAnimation);
  root.classList.toggle('theme-lite', !theme.accentAnimation);
}
