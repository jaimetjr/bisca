/**
 * PURE achievement evaluator. Receives a snapshot of the just-finished game
 * plus enough recent history to evaluate streak-style rules. Returns the IDs
 * of any achievements newly unlocked by this game.
 *
 * NO ENGINE IMPORTS. Operates on serialised game-history records, not on
 * GameState. This is enforced by tests/unit/achievements.test.ts so that no
 * pay-to-win surface ever sneaks in via this code path.
 */

export type GameResult = 'win' | 'loss' | 'draw';
export type GameMode = 'ai' | 'online';

export interface EvaluatedGame {
  result: GameResult;
  score: number;
  opponentScore: number;
  mode: GameMode;
}

export interface AchievementContext {
  /** The game that just finished. */
  thisGame: EvaluatedGame;
  /**
   * The user's previous games, ORDERED FROM MOST RECENT TO OLDEST, NOT
   * INCLUDING `thisGame`. Only `result` and `mode` are read; pass at least
   * the last 4 to support streak checks.
   */
  previousGames: ReadonlyArray<Pick<EvaluatedGame, 'result' | 'mode'>>;
  /** IDs of achievements the user has already unlocked. */
  alreadyUnlocked: ReadonlySet<string>;
}

export function evaluateAchievements(ctx: AchievementContext): string[] {
  const { thisGame, previousGames, alreadyUnlocked } = ctx;
  const newlyUnlocked: string[] = [];

  const isWin = thisGame.result === 'win';

  if (isWin && !alreadyUnlocked.has('first_win')) {
    newlyUnlocked.push('first_win');
  }

  if (isWin && thisGame.mode === 'online' && !alreadyUnlocked.has('first_online_win')) {
    newlyUnlocked.push('first_online_win');
  }

  if (isWin && thisGame.score >= 100 && !alreadyUnlocked.has('centurion')) {
    newlyUnlocked.push('centurion');
  }

  if (isWin && thisGame.score - thisGame.opponentScore >= 60 && !alreadyUnlocked.has('landslide')) {
    newlyUnlocked.push('landslide');
  }

  if (isWin && !alreadyUnlocked.has('hat_trick')) {
    // Need the previous 2 games to also be wins.
    const lastTwo = previousGames.slice(0, 2);
    if (lastTwo.length === 2 && lastTwo.every((g) => g.result === 'win')) {
      newlyUnlocked.push('hat_trick');
    }
  }

  return newlyUnlocked;
}
