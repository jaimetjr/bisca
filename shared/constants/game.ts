// Timing constants (milliseconds)
export const TRICK_DISPLAY_MS = 1500;
export const AI_DELAY_MIN_MS = 600;
export const AI_DELAY_MAX_MS = 400; // added to min, so range is [600, 1000]
export const DEAL_ANIMATION_DURATION_MS = 350;
export const DEAL_ANIMATION_STAGGER_MS = 120;
export const CONNECTION_TIMEOUT_MS = 10_000;
export const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
export const AFK_TIMEOUT_MS = 120_000;         // 2 minutes — configurable
export const AFK_WARNING_MS = 30_000;          // warning sent this many ms before kick
export const ROOM_CLEANUP_AFTER_GAME_MS = 5 * 60 * 1000; // 5 minutes

// Game rules
export const GAME_WIN_SCORE = 61;
export const ROOM_CODE_LENGTH = 5;
export const PLAYER_NAME_MAX_LENGTH = 12;

// AI strategy thresholds (points) — consumed only by the legacy heuristic in
// shared/lib/brisca/ai-heuristic.ts
export const AI_TRICK_WIN_THRESHOLD_LOW = 6;
export const AI_TRICK_WIN_THRESHOLD_HIGH = 10;
export const AI_SAFE_DISCARD_MAX_POINTS = 2;

// Legacy heuristic difficulty configs. No longer what drives live AI play —
// the PIMC search (AI_SEARCH_CONFIG below) does. Kept because the heuristic is
// still used for alpha-beta move ordering and as the tournament test baseline.
export const AI_DIFFICULTY_CONFIG = {
  easy: { winThresholdLow: Infinity, winThresholdHigh: Infinity, trackPlayed: false },
  medium: { winThresholdLow: AI_TRICK_WIN_THRESHOLD_LOW, winThresholdHigh: AI_TRICK_WIN_THRESHOLD_HIGH, trackPlayed: false },
  hard: { winThresholdLow: 4, winThresholdHigh: 6, trackPlayed: true },
} as const;

/**
 * Real search parameters for the PIMC engine (shared/lib/brisca/ai-search.ts).
 *
 * - `simulations`: determinizations sampled per move.
 * - `maxTrickDepth`: how many tricks ahead iterative deepening may reach.
 * - `epsilon`: chance of deliberately not taking the best-scoring card, so the
 *   bot is fallible rather than robotic. Easy is shallow *and* frequently
 *   wrong; hard is nearly always right.
 * - `timeBudgetMs`: wall-clock cap per move. Hides inside the existing
 *   600–1000ms AI delay in app/game.tsx, so search never causes a visible
 *   stall — running out of budget just yields a shallower complete answer.
 */
export const AI_SEARCH_CONFIG = {
  easy:   { simulations: 1,  maxTrickDepth: 1, epsilon: 0.50, timeBudgetMs: 15 },
  medium: { simulations: 8,  maxTrickDepth: 2, epsilon: 0.15, timeBudgetMs: 50 },
  hard:   { simulations: 20, maxTrickDepth: 4, epsilon: 0.03, timeBudgetMs: 120 },
} as const;

// Cutoff evaluation: weight on hand potential relative to captured points.
// Deliberately well under 1 so real captured points dominate speculation.
export const AI_HAND_POTENTIAL_WEIGHT = 0.5;

// Game speed multipliers applied to TRICK_DISPLAY_MS
export const GAME_SPEED_MULTIPLIER = {
  slow: 1.5,
  normal: 1.0,
  fast: 0.5,
} as const;
