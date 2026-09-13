export const MAX_RECONNECT_DELAY_MS = 10_000;

/**
 * Delay before the next reconnect attempt, or null once the window has closed.
 * Counts against a deadline, not an attempt cap: what decides success is
 * whether the server still holds the room.
 */
export function nextReconnectDelay(
  attempt: number,
  disconnectedAt: number,
  graceMs: number,
  now: number = Date.now(),
  rand: () => number = Math.random,
): number | null {
  if (now - disconnectedAt >= graceMs) return null;
  const base = Math.min(1000 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
  // Jitter, or a restart brings every client back in the same millisecond.
  return Math.round(base * (0.8 + rand() * 0.4));
}
