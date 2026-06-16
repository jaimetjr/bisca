import { describe, it, expect } from 'vitest';
import { createGameState } from '../../shared/lib/brisca/engine';
import {
  EMPTY_REWARDS_STATE,
  canEarnMore,
  consumeSkipPass,
  grantSkipPass,
  timeUntilNextRewardMs,
} from '../../shared/lib/rewards/grant';
import {
  MAX_REWARDS_PER_WINDOW,
  MAX_SKIP_PASSES,
  REWARD_WINDOW_MS,
} from '../../shared/lib/rewards/types';

const sampleConfigs = [
  { id: 'p1', name: 'Alice', isAI: false },
  { id: 'p2', name: 'Bob', isAI: false },
];

describe('rewards: no pay-to-win guardrail', () => {
  it('granting a skip pass does not mutate GameState in any way', () => {
    const state = createGameState(sampleConfigs);
    const snapshot = JSON.stringify(state);

    let rewards = EMPTY_REWARDS_STATE;
    rewards = grantSkipPass(rewards, 1_000_000);
    rewards = grantSkipPass(rewards, 2_000_000);

    expect(JSON.stringify(state)).toBe(snapshot);
    expect(rewards.skipPasses).toBe(2);
  });

  it('consuming a skip pass does not mutate GameState in any way', () => {
    const state = createGameState(sampleConfigs);
    const snapshot = JSON.stringify(state);

    let rewards = grantSkipPass(EMPTY_REWARDS_STATE, 1_000_000);
    const result = consumeSkipPass(rewards);
    rewards = result.state;

    expect(JSON.stringify(state)).toBe(snapshot);
    expect(result.consumed).toBe(true);
    expect(rewards.skipPasses).toBe(0);
  });

  it('RewardsState type only exposes cosmetic/convenience fields (no GameState keys)', () => {
    // Structural assertion: every key in RewardsState is non-game.
    // If someone adds a field with the same name as a GameState slot, this breaks.
    const sample = createGameState(sampleConfigs);
    const rewards = grantSkipPass(EMPTY_REWARDS_STATE);

    const gameStateKeys = new Set(Object.keys(sample));
    const rewardKeys = Object.keys(rewards);
    for (const k of rewardKeys) {
      expect(gameStateKeys.has(k)).toBe(false);
    }
  });
});

describe('rewards: frequency cap', () => {
  it('allows up to MAX_REWARDS_PER_WINDOW grants in a fresh window', () => {
    let s = EMPTY_REWARDS_STATE;
    let now = 1_000_000;
    for (let i = 0; i < MAX_REWARDS_PER_WINDOW; i++) {
      expect(canEarnMore(s, now)).toBe(true);
      s = grantSkipPass(s, now);
      now += 1000;
    }
    expect(canEarnMore(s, now)).toBe(false);
    expect(s.skipPasses).toBe(MAX_REWARDS_PER_WINDOW);
  });

  it('grantSkipPass is a no-op when over the cap', () => {
    let s = EMPTY_REWARDS_STATE;
    let now = 1_000_000;
    for (let i = 0; i < MAX_REWARDS_PER_WINDOW; i++) {
      s = grantSkipPass(s, now);
      now += 1000;
    }
    const before = s.skipPasses;
    s = grantSkipPass(s, now); // should be ignored
    expect(s.skipPasses).toBe(before);
  });

  it('window slides — old timestamps drop off after REWARD_WINDOW_MS', () => {
    let s = EMPTY_REWARDS_STATE;
    s = grantSkipPass(s, 1_000_000);
    s = grantSkipPass(s, 1_001_000);
    s = grantSkipPass(s, 1_002_000);

    const past = 1_002_001 + REWARD_WINDOW_MS;
    expect(canEarnMore(s, past)).toBe(true);
  });

  it('timeUntilNextRewardMs returns 0 when under cap, positive when at cap', () => {
    let s = EMPTY_REWARDS_STATE;
    expect(timeUntilNextRewardMs(s, 1_000_000)).toBe(0);

    s = grantSkipPass(s, 1_000_000);
    s = grantSkipPass(s, 1_001_000);
    s = grantSkipPass(s, 1_002_000);
    const wait = timeUntilNextRewardMs(s, 1_002_000);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(REWARD_WINDOW_MS);
  });

  it('skipPasses are clamped at MAX_SKIP_PASSES even across windows', () => {
    let s = EMPTY_REWARDS_STATE;
    let now = 0;
    // Burn through many windows
    for (let i = 0; i < MAX_SKIP_PASSES + 5; i++) {
      s = grantSkipPass(s, now);
      now += REWARD_WINDOW_MS + 1;
    }
    expect(s.skipPasses).toBeLessThanOrEqual(MAX_SKIP_PASSES);
  });
});

describe('rewards: consume', () => {
  it('consumeSkipPass returns consumed=false when skipPasses is 0', () => {
    const result = consumeSkipPass(EMPTY_REWARDS_STATE);
    expect(result.consumed).toBe(false);
    expect(result.state.skipPasses).toBe(0);
  });

  it('consumeSkipPass decrements by exactly one', () => {
    let s = grantSkipPass(EMPTY_REWARDS_STATE, 1_000_000);
    s = grantSkipPass(s, 1_001_000);
    expect(s.skipPasses).toBe(2);

    const r1 = consumeSkipPass(s);
    expect(r1.state.skipPasses).toBe(1);
    expect(r1.consumed).toBe(true);

    const r2 = consumeSkipPass(r1.state);
    expect(r2.state.skipPasses).toBe(0);
    expect(r2.consumed).toBe(true);

    const r3 = consumeSkipPass(r2.state);
    expect(r3.state.skipPasses).toBe(0);
    expect(r3.consumed).toBe(false);
  });
});
