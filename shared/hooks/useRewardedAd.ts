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

/** Max consecutive failed loads to retry before giving up until remount/show. */
const MAX_LOAD_RETRIES = 3;
/** Base backoff between retries; doubled each attempt (4s → 8s → 16s). */
const BASE_RETRY_DELAY_MS = 4000;

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
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onEarnedRef.current = onEarned;
  disabledRef.current = disabled;

  const loadNext = useRef(function load() {
    if (disabledRef.current || Platform.OS === 'web' || !mountedRef.current) return;
    // Cancel any pending retry so we never run two loads in parallel.
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setIsLoaded(false);

    const ad = RewardedAd.createForAdRequest(AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    });

    ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      retryCountRef.current = 0;
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
      // Bounded retry with exponential backoff: a transient failure (no fill,
      // flaky network) recovers on its own, but we stop after MAX_LOAD_RETRIES
      // so a persistent error never turns into an infinite request loop.
      if (!mountedRef.current || retryCountRef.current >= MAX_LOAD_RETRIES) return;
      const delay = BASE_RETRY_DELAY_MS * 2 ** retryCountRef.current;
      retryCountRef.current += 1;
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        loadNext.current();
      }, delay);
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
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const showAd = useCallback(async () => {
    if (disabledRef.current || Platform.OS === 'web') return;
    if (adRef.current && isLoaded) {
      await adRef.current.show();
      return;
    }
    // Not loaded (e.g. retries exhausted): kick a fresh load so a manual
    // retry path has something to show next time.
    retryCountRef.current = 0;
    loadNext.current();
  }, [isLoaded]);

  return { isLoaded, showAd };
}
