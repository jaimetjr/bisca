/**
 * PURE quest helpers — date math, deterministic per-day quest picking, and
 * progress-delta evaluation. No engine imports. No side effects.
 */
import { QuestDef, QUESTS_PER_DAY } from './types';
import { QUESTS } from './definitions';
import type { EvaluatedGame } from '../achievements/evaluator';

/** Returns 'YYYY-MM-DD' in UTC for the given Date (defaults to now). */
export function utcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Stable 32-bit string hash (FNV-1a). Pure — same input => same output.
 * Used only to seed quest selection; not security-critical.
 */
function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Picks `n` quests for the given UTC date. Deterministic: every player sees
 * the same quests on the same day. Same input -> same output across processes.
 */
export function pickTodaysQuests(
  date: string,
  n: number = QUESTS_PER_DAY,
  catalog: readonly QuestDef[] = QUESTS,
): QuestDef[] {
  const scored = catalog.map((q) => ({ q, score: hash32(`${date}|${q.id}`) }));
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, Math.min(n, scored.length)).map((s) => s.q);
}

/**
 * Returns the progress delta a single finished game contributes to the
 * given quest. Always >= 0; the caller decides clamping against the target.
 */
export function deltaForQuest(quest: QuestDef, game: EvaluatedGame): number {
  const d = quest.evalDelta(game);
  return d > 0 ? d : 0;
}
