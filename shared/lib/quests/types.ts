/**
 * Daily quest definitions. PURE DATA — no engine imports.
 *
 * Quest rewards are cosmetic XP only. Nothing here may grant in-match
 * advantage. See tests/unit/quests.test.ts for the no-P2W invariant.
 */
import type { EvaluatedGame } from '../achievements/evaluator';

export interface QuestDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  /** Cosmetic XP awarded on claim. */
  xp: number;
  /** Pure: how much this game contributes to the quest. Returns 0 if irrelevant. */
  evalDelta: (game: EvaluatedGame) => number;
}

export interface QuestProgress {
  questId: string;
  questDate: string; // 'YYYY-MM-DD' UTC
  progress: number;
  target: number;
  claimed: boolean;
}

export const QUESTS_PER_DAY = 3;
