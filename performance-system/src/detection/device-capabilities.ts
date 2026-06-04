import type { DetectionReason, DeviceSignals } from '../types.js';
import {
  getUserAgent,
  hasWeakGpuHint,
  isIPad4,
  isLegacyDevice,
  isOldSafari,
} from './user-agent.js';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function readHardwareConcurrency(): number {
  const n = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4;
  return typeof n === 'number' && n > 0 ? n : 4;
}

/** `navigator.deviceMemory` in GB; null if unsupported (Safari, Firefox). */
export function readDeviceMemory(): number | null {
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav?.deviceMemory === 'number') return nav.deviceMemory;
  return null;
}

export async function isLowPowerDevice(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;

  const nav = navigator as Navigator & {
    getBattery?: () => Promise<{
      charging: boolean;
      level: number;
      addEventListener: (type: string, fn: () => void) => void;
    }>;
  };

  if (!nav.getBattery) return false;

  try {
    const battery = await nav.getBattery();
    return !battery.charging && battery.level < 0.2;
  } catch {
    return false;
  }
}

export function isSaveDataEnabled(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } })
    .connection;
  return Boolean(conn?.saveData);
}

export function collectDeviceSignals(
  lowPower = false,
  ua = getUserAgent(),
): DeviceSignals {
  return {
    hardwareConcurrency: readHardwareConcurrency(),
    deviceMemory: readDeviceMemory(),
    isReducedMotion: prefersReducedMotion(),
    isOldSafari: isOldSafari(ua),
    isIPad4: isIPad4(ua),
    isLegacyDevice: isLegacyDevice(ua),
    isLowPower: lowPower,
    isSaveData: isSaveDataEnabled(),
    weakGpuHint: hasWeakGpuHint(ua),
    userAgent: ua,
  };
}

export function scoreDeviceWeakness(signals: DeviceSignals): {
  score: number;
  reasons: DetectionReason[];
} {
  const reasons: DetectionReason[] = [];
  let score = 0;

  if (signals.isReducedMotion) {
    score += 100;
    reasons.push('reduced-motion');
  }
  if (signals.isIPad4) {
    score += 80;
    reasons.push('ipad-4');
  }
  if (signals.isOldSafari) {
    score += 50;
    reasons.push('old-safari');
  }
  if (signals.isLegacyDevice) {
    score += 70;
    reasons.push('legacy-device');
  }
  if (signals.deviceMemory !== null && signals.deviceMemory <= 2) {
    score += 60;
    reasons.push('low-memory');
  }
  if (signals.hardwareConcurrency <= 2) {
    score += 40;
    reasons.push('low-cpu');
  }
  if (signals.isLowPower) {
    score += 35;
    reasons.push('low-power');
  }
  if (signals.isSaveData) {
    score += 30;
    reasons.push('save-data');
  }
  if (signals.weakGpuHint) {
    score += 25;
    reasons.push('weak-gpu-hint');
  }

  return { score, reasons };
}

/** Score threshold: at or above → lite tier in auto mode. */
export const AUTO_LITE_THRESHOLD = 50;
