import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import {
  DEFAULT_REVIEW_STATE,
  ReviewState,
  decideReview,
  markPrompted,
} from '../lib/review-gate';

const REVIEW_KEY = '@bisca:review_prompt';

async function readState(): Promise<ReviewState> {
  try {
    const raw = await AsyncStorage.getItem(REVIEW_KEY);
    if (!raw) return DEFAULT_REVIEW_STATE;
    return { ...DEFAULT_REVIEW_STATE, ...(JSON.parse(raw) as Partial<ReviewState>) };
  } catch {
    return DEFAULT_REVIEW_STATE;
  }
}

async function writeState(state: ReviewState): Promise<void> {
  try {
    await AsyncStorage.setItem(REVIEW_KEY, JSON.stringify(state));
  } catch {
    // A failed write only costs us a prompt opportunity later. Never let
    // storage break the end-of-game flow.
  }
}

/**
 * End-of-game hook into Play's in-app review flow. The decision rules live in
 * `shared/lib/review-gate` and are unit tested; this only does the IO.
 *
 * State is read at call time rather than in a `useEffect` because a game can
 * reach `gameOver` before an effect-loaded state would be ready, and nothing
 * here is rendered.
 */
export function useReviewPrompt() {
  /**
   * Records a finished game and asks for a review when the player won and all
   * gates pass. Never throws and never blocks the caller's navigation.
   */
  const recordGameFinished = useCallback(async (didWin: boolean): Promise<void> => {
    const { next, shouldPrompt } = decideReview(await readState(), didWin, Date.now());

    if (!shouldPrompt) {
      await writeState(next);
      return;
    }

    try {
      // `hasAction()` also covers the case where neither a native review flow
      // nor a store URL fallback is configured (e.g. iOS with no appStoreUrl).
      if ((await StoreReview.isAvailableAsync()) && (await StoreReview.hasAction())) {
        await StoreReview.requestReview();
        await writeState(markPrompted(next, Date.now()));
        return;
      }
    } catch {
      // Native failures are a non-event for the player. Fall through and save
      // the game count without stamping a prompt, so we can try again later.
    }

    await writeState(next);
  }, []);

  return { recordGameFinished };
}
