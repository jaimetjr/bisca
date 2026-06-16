import {
  RewardsState,
  REWARD_WINDOW_MS,
  MAX_REWARDS_PER_WINDOW,
  MAX_SKIP_PASSES,
} from './types';

export const EMPTY_REWARDS_STATE: RewardsState = {
  skipPasses: 0,
  recentRewardTimestamps: [],
};

function pruneTimestamps(timestamps: number[], now: number): number[] {
  const cutoff = now - REWARD_WINDOW_MS;
  return timestamps.filter((t) => t >= cutoff);
}

export function canEarnMore(state: RewardsState, now: number = Date.now()): boolean {
  const recent = pruneTimestamps(state.recentRewardTimestamps, now);
  return recent.length < MAX_REWARDS_PER_WINDOW;
}

export function timeUntilNextRewardMs(state: RewardsState, now: number = Date.now()): number {
  const recent = pruneTimestamps(state.recentRewardTimestamps, now);
  if (recent.length < MAX_REWARDS_PER_WINDOW) return 0;
  const oldest = recent[0];
  return Math.max(0, oldest + REWARD_WINDOW_MS - now);
}

export function grantSkipPass(state: RewardsState, now: number = Date.now()): RewardsState {
  if (!canEarnMore(state, now)) return state;
  const recent = pruneTimestamps(state.recentRewardTimestamps, now);
  return {
    skipPasses: Math.min(MAX_SKIP_PASSES, state.skipPasses + 1),
    recentRewardTimestamps: [...recent, now],
  };
}

export function consumeSkipPass(state: RewardsState): { state: RewardsState; consumed: boolean } {
  if (state.skipPasses <= 0) return { state, consumed: false };
  return {
    state: { ...state, skipPasses: state.skipPasses - 1 },
    consumed: true,
  };
}
