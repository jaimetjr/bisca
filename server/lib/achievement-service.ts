import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { gameHistory, userAchievements } from '../../shared/lib/schema';
import {
  evaluateAchievements,
  type EvaluatedGame,
} from '../../shared/lib/achievements/evaluator';

export interface RecordGameInput extends EvaluatedGame {
  userId: string;
}

/**
 * Persist a finished game and grant any newly unlocked achievements.
 * Returns the IDs that were newly unlocked by this call.
 *
 * Achievement evaluation is server-authoritative — clients never claim
 * achievements directly.
 */
export async function recordGameAndEvaluate(input: RecordGameInput): Promise<string[]> {
  const { userId, result, score, opponentScore, mode } = input;

  // Pull the last 4 games BEFORE inserting the current one — these become the
  // "previous games" context for streak-style achievements.
  const previous = await db
    .select({ result: gameHistory.result, mode: gameHistory.mode })
    .from(gameHistory)
    .where(eq(gameHistory.userId, userId))
    .orderBy(desc(gameHistory.playedAt))
    .limit(4);

  const alreadyUnlocked = await db
    .select({ achievementId: userAchievements.achievementId })
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));

  await db.insert(gameHistory).values({
    userId,
    result,
    score,
    opponentScore,
    mode,
  });

  const newlyUnlocked = evaluateAchievements({
    thisGame: { result, score, opponentScore, mode },
    previousGames: previous.map((g) => ({
      result: g.result as EvaluatedGame['result'],
      mode: g.mode as EvaluatedGame['mode'],
    })),
    alreadyUnlocked: new Set(alreadyUnlocked.map((a) => a.achievementId)),
  });

  if (newlyUnlocked.length > 0) {
    await db
      .insert(userAchievements)
      .values(
        newlyUnlocked.map((id) => ({ userId, achievementId: id })),
      )
      .onConflictDoNothing();
  }

  return newlyUnlocked;
}

export async function listUnlockedAchievementIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ achievementId: userAchievements.achievementId })
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));
  return rows.map((r) => r.achievementId);
}
