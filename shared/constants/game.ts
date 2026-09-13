// Timing constants (milliseconds)
export const TRICK_DISPLAY_MS = 1500;
export const AI_DELAY_MIN_MS = 600;
export const AI_DELAY_MAX_MS = 400; // added to min, so range is [600, 1000]
export const DEAL_ANIMATION_DURATION_MS = 350;
export const DEAL_ANIMATION_STAGGER_MS = 120;
/**
 * How long the whole deal-in takes: the last of the three cards starts after
 * two staggers and then runs its full duration. Used to hold the first AI move
 * until the deal has visibly finished — before the starting seat was random the
 * AI never led, so its 600ms delay always landed well clear of the animation.
 */
export const DEAL_ANIMATION_TOTAL_MS =
  DEAL_ANIMATION_DURATION_MS + 2 * DEAL_ANIMATION_STAGGER_MS;
export const CONNECTION_TIMEOUT_MS = 10_000;
export const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
export const AFK_TIMEOUT_MS = 120_000;         // 2 minutes — configurable
export const AFK_WARNING_MS = 30_000;          // warning sent this many ms before kick
export const ROOM_CLEANUP_AFTER_GAME_MS = 5 * 60 * 1000; // 5 minutes
/** How long a waiting room is held open after its host's socket drops. */
export const LOBBY_DISCONNECT_GRACE_MS = 120_000;
/** How long a *full* waiting room sits before closing. Never armed while filling. */
export const LOBBY_IDLE_TIMEOUT_MS = 180_000;
/** How far ahead of the close everyone is warned. */
export const LOBBY_IDLE_WARNING_MS = 30_000;
/** How long a non-host sits on "room is gone" before returning to the list. */
export const LOBBY_GONE_REDIRECT_SECONDS = 15;
/** End-of-match screen timeout for non-hosts. The host is exempt. */
export const MATCH_END_TIMEOUT_SECONDS = 30;
/** Bound on "waiting for host": a host who walks away sends nothing. */
export const REMATCH_WAIT_SECONDS = 60;
/** Client's own liveness probe interval. Must stay under HEARTBEAT_INTERVAL_MS. */
export const CLIENT_PING_INTERVAL_MS = 20_000;
/** How long the client waits for a `pong` before declaring the socket dead. */
export const CLIENT_PONG_TIMEOUT_MS = 5_000;

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

/**
 * The dials that decide what a bot *wants*, as opposed to how well it computes.
 *
 * Difficulty (AI_SEARCH_CONFIG above) owns strength — how deep it looks and how
 * often it deliberately errs. These own taste, and are what give each opponent
 * persona in shared/lib/brisca/opponents.ts a recognisable style at unchanged
 * strength. They live here rather than in the persona catalog so ai-search.ts
 * never has to import the catalog.
 */
/**
 * Only two dials, on purpose. The evaluation has a third term — credit for the
 * unfinished trick — and it was tried here first; it moved measured play by
 * about 1%, because the search looks far enough ahead that the trick resolves
 * into real captured points and the heuristic stops mattering. A dial that
 * cannot change the card chosen is a style label with nothing behind it, so it
 * is not offered. The same goes for CONTESTED_TRICK_POINTS in ai-search.ts,
 * which only orders moves for alpha-beta.
 */
export interface EvalWeights {
  /** What a trump that is still master is worth in future capture. */
  trumpControlBonus: number;
  /** Weight on hand potential relative to points already captured. */
  handPotentialWeight: number;
}

/** The engine's long-standing values — the style-neutral baseline. */
export const NEUTRAL_WEIGHTS: EvalWeights = {
  trumpControlBonus: 4,
  handPotentialWeight: AI_HAND_POTENTIAL_WEIGHT,
};

// Game speed multipliers applied to TRICK_DISPLAY_MS
export const GAME_SPEED_MULTIPLIER = {
  slow: 1.5,
  normal: 1.0,
  fast: 0.5,
} as const;
