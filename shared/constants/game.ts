// Timing constants (milliseconds)
export const TRICK_DISPLAY_MS = 1500;
export const AI_DELAY_MIN_MS = 600;
export const AI_DELAY_MAX_MS = 400; // added to min, so range is [600, 1000]
export const DEAL_ANIMATION_DURATION_MS = 350;
export const DEAL_ANIMATION_STAGGER_MS = 120;
export const CONNECTION_TIMEOUT_MS = 10_000;
export const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
export const ROOM_CLEANUP_AFTER_GAME_MS = 5 * 60 * 1000; // 5 minutes

// Game rules
export const GAME_WIN_SCORE = 61;
export const ROOM_CODE_LENGTH = 5;
export const PLAYER_NAME_MAX_LENGTH = 12;

// AI strategy thresholds (points)
export const AI_TRICK_WIN_THRESHOLD_LOW = 6;
export const AI_TRICK_WIN_THRESHOLD_HIGH = 10;
export const AI_SAFE_DISCARD_MAX_POINTS = 2;

// AI difficulty configs
export const AI_DIFFICULTY_CONFIG = {
  easy: { winThresholdLow: Infinity, winThresholdHigh: Infinity, trackPlayed: false },
  medium: { winThresholdLow: AI_TRICK_WIN_THRESHOLD_LOW, winThresholdHigh: AI_TRICK_WIN_THRESHOLD_HIGH, trackPlayed: false },
  hard: { winThresholdLow: 4, winThresholdHigh: 6, trackPlayed: true },
} as const;

// Game speed multipliers applied to TRICK_DISPLAY_MS
export const GAME_SPEED_MULTIPLIER = {
  slow: 1.5,
  normal: 1.0,
  fast: 0.5,
} as const;
