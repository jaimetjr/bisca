import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { userQuestProgress } from '../../shared/lib/schema';
import {
  pickTodaysQuests,
  utcDateString,
  deltaForQuest,
} from '../../shared/lib/quests/evaluator';
import { QUEST_BY_ID } from '../../shared/lib/quests/definitions';
import type { QuestDef, QuestProgress } from '../../shared/lib/quests/types';
import type { EvaluatedGame } from '../../shared/lib/achievements/evaluator';

/**
 * Returns today's quests for the user — both their persisted progress (for
 * any rows that exist) and a zero-progress placeholder for any of today's
 * picks they haven't accumulated against yet. The DB row is created lazily
 * on the first matching game.
 */
export async function getTodaysQuests(clerkUserId: string): Promise<{
  date: string;
  quests: Array<{ def: QuestDef; progress: QuestProgress }>;
}> {
  const date = utcDateString();
  const todaysDefs = pickTodaysQuests(date);

  const existing = await db
    .select()
    .from(userQuestProgress)
    .where(
      and(
        eq(userQuestProgress.clerkUserId, clerkUserId),
        eq(userQuestProgress.questDate, date),
      ),
    );
  const existingById = new Map(existing.map((r) => [r.questId, r]));

  const quests = todaysDefs.map((def) => {
    const row = existingById.get(def.id);
    return {
      def,
      progress: {
        questId: def.id,
        questDate: date,
        progress: row?.progress ?? 0,
        target: def.target,
        claimed: row?.claimed ?? false,
      } satisfies QuestProgress,
    };
  });

  return { date, quests };
}

/**
 * Apply a finished game to today's active quests. Increments per-quest
 * progress (clamped to target). Creates rows lazily if needed.
 */
export async function applyGameToTodaysQuests(
  clerkUserId: string,
  game: EvaluatedGame,
): Promise<void> {
  const date = utcDateString();
  const todaysDefs = pickTodaysQuests(date);

  for (const def of todaysDefs) {
    const delta = deltaForQuest(def, game);
    if (delta <= 0) continue;

    // Upsert: insert with delta if missing, else add delta clamped to target.
    await db
      .insert(userQuestProgress)
      .values({
        clerkUserId,
        questId: def.id,
        questDate: date,
        progress: Math.min(delta, def.target),
        target: def.target,
        claimed: false,
      })
      .onConflictDoUpdate({
        target: [
          userQuestProgress.clerkUserId,
          userQuestProgress.questDate,
          userQuestProgress.questId,
        ],
        set: {
          progress: sql`LEAST(${userQuestProgress.target}, ${userQuestProgress.progress} + ${delta})`,
        },
      });
  }
}

export interface ClaimResult {
  ok: boolean;
  reason?: 'unknown_quest' | 'not_today' | 'incomplete' | 'already_claimed';
  xp?: number;
}

/**
 * Mark a quest claimed and return the cosmetic XP awarded. Server-authoritative:
 * verifies progress >= target before awarding.
 */
export async function claimQuest(
  clerkUserId: string,
  questId: string,
): Promise<ClaimResult> {
  const def = QUEST_BY_ID.get(questId);
  if (!def) return { ok: false, reason: 'unknown_quest' };

  const date = utcDateString();
  const todaysIds = new Set(pickTodaysQuests(date).map((q) => q.id));
  if (!todaysIds.has(questId)) return { ok: false, reason: 'not_today' };

  const [row] = await db
    .select()
    .from(userQuestProgress)
    .where(
      and(
        eq(userQuestProgress.clerkUserId, clerkUserId),
        eq(userQuestProgress.questDate, date),
        eq(userQuestProgress.questId, questId),
      ),
    )
    .limit(1);

  if (!row || row.progress < row.target) return { ok: false, reason: 'incomplete' };
  if (row.claimed) return { ok: false, reason: 'already_claimed' };

  await db
    .update(userQuestProgress)
    .set({ claimed: true, claimedAt: sql`now()` })
    .where(
      and(
        eq(userQuestProgress.clerkUserId, clerkUserId),
        eq(userQuestProgress.questDate, date),
        eq(userQuestProgress.questId, questId),
      ),
    );

  return { ok: true, xp: def.xp };
}
