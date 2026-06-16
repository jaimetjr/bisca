/**
 * State for rewarded-ad bookkeeping.
 *
 * HARD GUARDRAIL: nothing in this slice may be referenced by
 * shared/lib/brisca/engine.ts or any GameState consumer. Rewards are cosmetic
 * and convenience only. See tests/unit/rewards.test.ts for enforcement.
 */
export interface RewardsState {
  /** Pending "skip the next post-game interstitial" credits. */
  skipPasses: number;
  /** Epoch-ms timestamps of recent rewarded-ad completions, oldest first. */
  recentRewardTimestamps: number[];
}

export const REWARD_WINDOW_MS = 30 * 60 * 1000; // 30 min
export const MAX_REWARDS_PER_WINDOW = 3;
export const MAX_SKIP_PASSES = 5;
