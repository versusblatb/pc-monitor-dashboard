const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';

/** Safari without Chrome/Firefox/Edge token (WebKit on iOS/macOS). */
export function isSafari(ua = UA): boolean {
  return /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg|OPR|FxiOS/i.test(ua);
}

/** Safari ≤ 15 / iOS 14 WebKit quirks — blur, backdrop-filter, heavy compositing. */
export function isOldSafari(ua = UA): boolean {
  if (!isSafari(ua)) return false;

  const safariMatch = ua.match(/Version\/(\d+)/i);
  if (safariMatch) {
    return parseInt(safariMatch[1], 10) <= 15;
  }

  // iOS WebKit without Version/ — infer from OS version
  const iosMatch = ua.match(/OS (\d+)[_.](\d+)/i);
  if (iosMatch) {
    const major = parseInt(iosMatch[1], 10);
    return major <= 14;
  }

  return false;
}

/**
 * iPad 4 (A6X): iPad3,4 / iPad3,5 / iPad3,6 in UA, or iPad on iOS 10 and below.
 */
export function isIPad4(ua = UA): boolean {
  if (!/iPad/i.test(ua)) return false;

  if (/iPad3,[456]/i.test(ua)) return true;

  const iosMatch = ua.match(/OS (\d+)[_.](\d+)/i);
  if (iosMatch) {
    return parseInt(iosMatch[1], 10) <= 10;
  }

  // Desktop-mode iPad may report Macintosh — check touch + maxTouchPoints
  if (/Macintosh/i.test(ua) && typeof navigator !== 'undefined') {
    const nav = navigator as Navigator & { maxTouchPoints?: number };
    if (nav.maxTouchPoints > 1) {
      // Old iPadOS masquerading as Mac often stuck on 15.x with 5 touch points — conservative
      const macSafari = /Version\/(\d+)/i.exec(ua);
      if (macSafari && parseInt(macSafari[1], 10) <= 15) return true;
    }
  }

  return false;
}

/** Very old Android / old iPhone / IE-mode hints. */
export function isLegacyDevice(ua = UA): boolean {
  if (/MSIE |Trident\/|Opera Mini/i.test(ua)) return true;

  const android = ua.match(/Android (\d+)/i);
  if (android && parseInt(android[1], 10) < 8) return true;

  if (/iPhone OS (\d+)/i.test(ua)) {
    const m = ua.match(/iPhone OS (\d+)/i);
    if (m && parseInt(m[1], 10) <= 10) return true;
  }

  if (isIPad4(ua)) return true;

  return false;
}

/** Software renderer / very old GPU hints from UA (best-effort). */
export function hasWeakGpuHint(ua = UA): boolean {
  if (isIPad4(ua) || isLegacyDevice(ua)) return true;
  // SwiftShader / llvmpipe sometimes appear in Electron debug builds
  if (/SwiftShader|llvmpipe|Mesa Offscreen/i.test(ua)) return true;
  return false;
}

export function getUserAgent(): string {
  return UA;
}
