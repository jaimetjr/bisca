import { useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { reportAdLoadError, reportAdGiveUp } from '@shared/lib/ad-monitoring';
import { createAdSlot } from '@shared/lib/ad-cache';
import { adsReady } from '@shared/lib/ads-ready';
import { useRewards } from './useRewards';

const AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : Platform.select({
      ios: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS,
      android: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID,
    }) ?? TestIds.INTERSTITIAL;

// App-wide: a loaded interstitial survives game-screen remounts (see ad-cache.ts).
// No requestNonPersonalizedAdsOnly: the UMP consent answer decides per player.
const slot = createAdSlot({
  create: () => InterstitialAd.createForAdRequest(AD_UNIT_ID),
  events: { loaded: AdEventType.LOADED, closed: AdEventType.CLOSED, error: AdEventType.ERROR },
  ready: adsReady,
  onLoadError: (error) => reportAdLoadError('interstitial', error),
  onGiveUp: (error) => reportAdGiveUp('interstitial', error),
});

/**
 * Keeps an interstitial loaded in the background and exposes showAd().
 * If isPremium is true or platform is web, showAd() is always a no-op.
 */
export function useInterstitialAd(isPremium: boolean) {
  const enabled = !isPremium && Platform.OS !== 'web';
  const { consumeSkipPass } = useRewards();

  useEffect(() => {
    if (enabled) slot.ensureLoaded();
  }, [enabled]);

  const showAd = useCallback(async () => {
    if (!enabled) return;
    // Honour any rewarded "skip pass" the user earned — non-P2W: this only
    // skips an interstitial, never alters gameplay or score.
    const skipped = await consumeSkipPass();
    if (skipped) return;
    await slot.show();
  }, [enabled, consumeSkipPass]);

  return { showAd };
}
