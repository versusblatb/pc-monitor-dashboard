import {
  AUTO_LITE_THRESHOLD,
  scoreDeviceWeakness,
} from '../detection/device-capabilities.js';
import { isLowFps } from '../detection/fps-probe.js';
import type {
  DetectionReason,
  DeviceSignals,
  FpsSample,
  PerformancePreference,
  PerformanceTier,
} from '../types.js';

export interface TierResolutionInput {
  preference: PerformancePreference;
  signals: DeviceSignals;
  fps: FpsSample | null;
}

export interface TierResolution {
  tier: PerformanceTier;
  reasons: DetectionReason[];
}

export function resolveTier(input: TierResolutionInput): TierResolution {
  const { preference, signals, fps } = input;

  if (preference === 'lite') {
    return { tier: 'lite', reasons: ['manual-lite'] };
  }
  if (preference === 'full') {
    return { tier: 'full', reasons: ['manual-full'] };
  }

  const { score, reasons } = scoreDeviceWeakness(signals);

  if (fps && isLowFps(fps)) {
    return {
      tier: 'lite',
      reasons: [...reasons, 'low-fps'],
    };
  }

  if (score >= AUTO_LITE_THRESHOLD) {
    return { tier: 'lite', reasons };
  }

  return { tier: 'full', reasons: [...reasons, 'default-full'] };
}
