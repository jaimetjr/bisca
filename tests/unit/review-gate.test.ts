import { describe, it, expect } from 'vitest';
import {
  DEFAULT_REVIEW_STATE,
  MAX_LIFETIME_PROMPTS,
  MIN_DAYS_BETWEEN_PROMPTS,
  MIN_GAMES_BEFORE_PROMPT,
  ReviewState,
  decideReview,
  markPrompted,
} from '@shared/lib/review-gate';

const NOW = Date.UTC(2026, 7, 29);
const DAY_MS = 24 * 60 * 60 * 1000;

function state(patch: Partial<ReviewState> = {}): ReviewState {
  return { ...DEFAULT_REVIEW_STATE, ...patch };
}

/** Plays `count` winning games in a row, threading state through. */
function winStreak(from: ReviewState, count: number, now = NOW) {
  let current = from;
  let prompts = 0;
  for (let i = 0; i < count; i++) {
    const { next, shouldPrompt } = decideReview(current, true, now);
    current = shouldPrompt ? markPrompted(next, now) : next;
    if (shouldPrompt) prompts++;
  }
  return { current, prompts };
}

describe('decideReview', () => {
  it('counts every finished game, won or lost', () => {
    expect(decideReview(state(), false, NOW).next.gamesCompleted).toBe(1);
    expect(decideReview(state(), true, NOW).next.gamesCompleted).toBe(1);
  });

  it('never prompts on a loss, however many games have been played', () => {
    const veteran = state({ gamesCompleted: 500 });
    expect(decideReview(veteran, false, NOW).shouldPrompt).toBe(false);
  });

  it('stays quiet until the minimum number of games is reached', () => {
    const { shouldPrompt } = decideReview(
      state({ gamesCompleted: MIN_GAMES_BEFORE_PROMPT - 2 }),
      true,
      NOW,
    );
    expect(shouldPrompt).toBe(false);
  });

  it('prompts on the win that reaches the game threshold', () => {
    const { shouldPrompt } = decideReview(
      state({ gamesCompleted: MIN_GAMES_BEFORE_PROMPT - 1 }),
      true,
      NOW,
    );
    expect(shouldPrompt).toBe(true);
  });

  it('does not prompt twice in a row — the cooldown holds', () => {
    const { prompts } = winStreak(state(), 10);
    expect(prompts).toBe(1);
  });

  it('prompts again once the cooldown has fully elapsed', () => {
    const prompted = markPrompted(state({ gamesCompleted: 10 }), NOW);
    const later = NOW + MIN_DAYS_BETWEEN_PROMPTS * DAY_MS;

    expect(decideReview(prompted, true, later - 1).shouldPrompt).toBe(false);
    expect(decideReview(prompted, true, later).shouldPrompt).toBe(true);
  });

  it('stops for good after the lifetime cap', () => {
    let current = state({ gamesCompleted: 10 });
    for (let i = 0; i < MAX_LIFETIME_PROMPTS; i++) {
      current = markPrompted(current, NOW + i * MIN_DAYS_BETWEEN_PROMPTS * DAY_MS);
    }
    expect(current.promptCount).toBe(MAX_LIFETIME_PROMPTS);

    const farFuture = NOW + 10 * 365 * DAY_MS;
    expect(decideReview(current, true, farFuture).shouldPrompt).toBe(false);
  });

  it('asks a real player at most MAX_LIFETIME_PROMPTS times over years of wins', () => {
    let current = state();
    let prompts = 0;
    // One win a week for five years.
    for (let week = 0; week < 260; week++) {
      const now = NOW + week * 7 * DAY_MS;
      const { next, shouldPrompt } = decideReview(current, true, now);
      current = shouldPrompt ? markPrompted(next, now) : next;
      if (shouldPrompt) prompts++;
    }
    expect(prompts).toBe(MAX_LIFETIME_PROMPTS);
    expect(current.gamesCompleted).toBe(260);
  });

  it('treats the incoming state as immutable', () => {
    const original = state({ gamesCompleted: 5 });
    const snapshot = { ...original };
    decideReview(original, true, NOW);
    markPrompted(original, NOW);
    expect(original).toEqual(snapshot);
  });
});
