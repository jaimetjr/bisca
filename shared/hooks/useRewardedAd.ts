import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';

const AD_UNIT_ID = __DEV__
  ? TestIds.REWARDED
  : Platform.select({
      ios: process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS,
      android: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID,
    }) ?? TestIds.REWARDED;

interface UseRewardedAdOptions {
  /** Called once the user completes the ad and qualifies for the reward. */
  onEarned: () => void;
  /** Skip loading entirely (e.g. premium users). */
  disabled?: boolean;
}

interface UseRewardedAdResult {
  isLoaded: boolean;
  showAd: () => Promise<void>;
}

/**
 * Loads a rewarded ad in the background and surfaces showAd().
 * The reward callback fires only on EARNED_REWARD (full view), never on dismiss.
 *
 * NOTE: rewards must be cosmetic / convenience only.
 * See shared/lib/rewards/types.ts and tests/unit/rewards.test.ts for the no-P2W
 * guardrail. Do not pass an onEarned that mutates GameState.
 */
export function useRewardedAd({ onEarned, disabled = false }: UseRewardedAdOptions): UseRewardedAdResult {
  const adRef = useRef<RewardedAd | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const onEarnedRef = useRef(onEarned);
  const disabledRef = useRef(disabled);
  const mountedRef = useRef(true);

  onEarnedRef.current = onEarned;
  disabledRef.current = disabled;

  const loadNext = useRef(function load() {
    if (disabledRef.current || Platform.OS === 'web' || !mountedRef.current) return;
    setIsLoaded(false);

    const ad = RewardedAd.createForAdRequest(AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    });

    ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      if (mountedRef.current) setIsLoaded(true);
    });

    ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      try {
        onEarnedRef.current();
      } catch (err) {
        console.warn('[useRewardedAd] onEarned threw:', err);
      }
    });

    ad.addAdEventListener(AdEventType.CLOSED, () => {
      if (mountedRef.current) setIsLoaded(false);
      adRef.current = null;
      loadNext.current();
    });

    ad.addAdEventListener(AdEventType.ERROR, () => {
      if (mountedRef.current) setIsLoaded(false);
      adRef.current = null;
      // Don't infinite-loop on errors — the next user-triggered load will retry.
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
    if (disabledRef.current || Platform.OS === 'web') return;
    if (adRef.current && isLoaded) {
      await adRef.current.show();
    }
  }, [isLoaded]);

  return { isLoaded, showAd };
}
