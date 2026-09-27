import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  TestIds,
} from 'react-native-google-mobile-ads';
import { reportAdLoadError, reportAdGiveUp } from '@shared/lib/ad-monitoring';
import { createAdSlot } from '@shared/lib/ad-cache';
import { adsReady } from '@shared/lib/ads-ready';

const AD_UNIT_ID = __DEV__
  ? TestIds.REWARDED
  : Platform.select({
      ios: process.env.EXPO_PUBLIC_ADMOB_REWARDED_IOS,
      android: process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID,
    }) ?? TestIds.REWARDED;

// App-wide: a loaded rewarded ad survives home-screen remounts (see ad-cache.ts).
// No requestNonPersonalizedAdsOnly: the UMP consent answer decides per player.
const slot = createAdSlot({
  create: () => RewardedAd.createForAdRequest(AD_UNIT_ID),
  events: {
    loaded: RewardedAdEventType.LOADED,
    earned: RewardedAdEventType.EARNED_REWARD,
    closed: AdEventType.CLOSED,
    error: AdEventType.ERROR,
  },
  ready: adsReady,
  onLoadError: (error) => reportAdLoadError('rewarded', error),
  onGiveUp: (error) => reportAdGiveUp('rewarded', error),
});

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
 * Keeps a rewarded ad loaded in the background and surfaces showAd().
 * The reward callback fires only on EARNED_REWARD (full view), never on dismiss.
 *
 * NOTE: rewards must be cosmetic / convenience only.
 * See shared/lib/rewards/types.ts and tests/unit/rewards.test.ts for the no-P2W
 * guardrail. Do not pass an onEarned that mutates GameState.
 */
export function useRewardedAd({ onEarned, disabled = false }: UseRewardedAdOptions): UseRewardedAdResult {
  const enabled = !disabled && Platform.OS !== 'web';
  const [isLoaded, setIsLoaded] = useState(() => enabled && slot.isLoaded());
  const onEarnedRef = useRef(onEarned);
  onEarnedRef.current = onEarned;

  useEffect(() => {
    if (!enabled) {
      setIsLoaded(false);
      return;
    }
    const unsubscribe = slot.subscribe(setIsLoaded);
    setIsLoaded(slot.isLoaded());
    slot.ensureLoaded();
    return unsubscribe;
  }, [enabled]);

  const showAd = useCallback(async () => {
    if (!enabled) return;
    await slot.show(() => onEarnedRef.current());
  }, [enabled]);

  return { isLoaded, showAd };
}
