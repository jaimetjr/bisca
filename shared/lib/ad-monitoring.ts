import * as Sentry from '@sentry/react-native';

// Client-only (imports the React Native Sentry SDK) — never import from server
// code. Centralises ad-failure reporting so every ad surface (banner,
// interstitial, rewarded) records WHY AdMob refused to serve: the error code
// distinguishes inventory problems (no-fill: normal for brand-new apps) from
// configuration bugs (invalid-request: wrong unit ID / unapproved app).

type AdType = 'banner' | 'interstitial' | 'rewarded';

// AdMob errors carry a string `code` like "googleMobileAds/no-fill".
function errorFields(error: unknown): { code: string; message: string } {
  const e = error as { code?: unknown; message?: unknown } | null | undefined;
  return {
    code: typeof e?.code === 'string' ? e.code : 'unknown',
    message: typeof e?.message === 'string' ? e.message : String(error),
  };
}

/**
 * Record a failed ad load as a Sentry breadcrumb (context attached to any
 * later event) + console.warn for local logcat visibility. Cheap — safe to
 * call on every retry attempt.
 */
export function reportAdLoadError(adType: AdType, error: unknown): void {
  const { code, message } = errorFields(error);
  console.warn(`[ads] ${adType} failed to load: ${code} — ${message}`);
  Sentry.addBreadcrumb({
    category: 'ads',
    level: 'warning',
    message: `${adType} ad load failed`,
    data: { code, message },
  });
}

/**
 * Emit an actual Sentry event — call when an ad surface gives up (retries
 * exhausted, or the surface has no retry). The code is part of the message so
 * Sentry groups issues per (ad type, failure reason). No-fill is skipped: it
 * is AdMob having no ad to sell, not actionable, and it flooded Sentry (fill
 * rate lives in the AdMob console). The breadcrumb from reportAdLoadError stays.
 */
export function reportAdGiveUp(adType: AdType, error: unknown): void {
  const { code, message } = errorFields(error);
  // Covers "no-fill", "error-code-no-fill" and "mediation-no-fill".
  if (code.includes('no-fill')) return;
  Sentry.captureMessage(`ad failed to load: ${adType} (${code})`, {
    level: 'warning',
    extra: { code, message },
  });
}
