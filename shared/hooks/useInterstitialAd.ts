import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';

const AD_UNIT_ID = __DEV__
  ? TestIds.INTERSTITIAL
  : Platform.select({
      ios: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS,
      android: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID,
    }) ?? TestIds.INTERSTITIAL;

/**
 * Loads an interstitial ad in the background and exposes showAd().
 * If isPremium is true or platform is web, showAd() is always a no-op.
 * The next ad is preloaded automatically after one is dismissed.
 */
export function useInterstitialAd(isPremium: boolean) {
  const adRef = useRef<InterstitialAd | null>(null);
  const isLoadedRef = useRef(false);
  const isPremiumRef = useRef(isPremium);
  const mountedRef = useRef(true);
  isPremiumRef.current = isPremium;

  // Stable function reference to create + load the next ad
  const loadNext = useRef(function load() {
    if (isPremiumRef.current || Platform.OS === 'web' || !mountedRef.current) return;
    isLoadedRef.current = false;

    const ad = InterstitialAd.createForAdRequest(AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    });

    ad.addAdEventListener(AdEventType.LOADED, () => {
      isLoadedRef.current = true;
    });

    ad.addAdEventListener(AdEventType.CLOSED, () => {
      isLoadedRef.current = false;
      adRef.current = null;
      loadNext.current(); // preload next ad immediately after dismiss
    });

    adRef.current = ad;
    ad.load();
  });

  useEffect(() => {
    mountedRef.current = true;
    loadNext.current();
    return () => {
      mountedRef.current = false;
      adRef.current = null;
    };
  }, []);

  const showAd = useCallback(async () => {
    if (isPremiumRef.current || Platform.OS === 'web') return;
    if (adRef.current && isLoadedRef.current) {
      await adRef.current.show();
    }
  }, []);

  return { showAd };
}
