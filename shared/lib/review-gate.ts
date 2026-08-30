/**
 * Pure decision logic for the Play in-app review prompt.
 *
 * Kept free of React and React Native imports so it can be unit tested in the
 * node environment, matching how the rest of the game logic under `shared/lib`
 * is structured. All IO lives in `shared/hooks/useReviewPrompt.ts`.
 */

/** Never ask someone who hasn't finished a few games — they have nothing to rate yet. */
export const MIN_GAMES_BEFORE_PROMPT = 3;
/** Play's own quota is roughly one dialog per user per month; stay well clear of it. */
export const MIN_DAYS_BETWEEN_PROMPTS = 60;
export const MAX_LIFETIME_PROMPTS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewState {
  gamesCompleted: number;
  /** Epoch ms of the last `requestReview()` attempt, or null if never asked. */
  lastPromptedAt: number | null;
  promptCount: number;
}

export const DEFAULT_REVIEW_STATE: ReviewState = {
  gamesCompleted: 0,
  lastPromptedAt: null,
  promptCount: 0,
};

/**
 * Records a finished game and decides whether this is a moment to ask for a
 * rating. `shouldPrompt` is only ever true after a win: a player who just lost
 * is not the person you want rating you.
 */
export function decideReview(
  state: ReviewState,
  didWin: boolean,
  now: number,
): { next: ReviewState; shouldPrompt: boolean } {
  const next: ReviewState = { ...state, gamesCompleted: state.gamesCompleted + 1 };

  if (!didWin) return { next, shouldPrompt: false };
  if (next.gamesCompleted < MIN_GAMES_BEFORE_PROMPT) return { next, shouldPrompt: false };
  if (next.promptCount >= MAX_LIFETIME_PROMPTS) return { next, shouldPrompt: false };
  if (
    next.lastPromptedAt !== null &&
    now - next.lastPromptedAt < MIN_DAYS_BETWEEN_PROMPTS * DAY_MS
  ) {
    return { next, shouldPrompt: false };
  }

  return { next, shouldPrompt: true };
}

/**
 * Stamps an *attempted* prompt. Play gives no signal about whether the dialog
 * actually appeared, so an attempt has to count against our own quota —
 * otherwise an exhausted Play quota would make us retry on every single game.
 */
export function markPrompted(state: ReviewState, now: number): ReviewState {
  return { ...state, lastPromptedAt: now, promptCount: state.promptCount + 1 };
}
