import { describe, it, expect } from 'vitest';
import { createGameState } from '../../shared/lib/brisca/engine';
import {
  evaluateAchievements,
  type AchievementContext,
  type EvaluatedGame,
} from '../../shared/lib/achievements/evaluator';
import { ACHIEVEMENTS } from '../../shared/lib/achievements/definitions';

function ctx(overrides: Partial<AchievementContext> & { thisGame: EvaluatedGame }): AchievementContext {
  return {
    previousGames: [],
    alreadyUnlocked: new Set(),
    ...overrides,
  };
}

const winAi: EvaluatedGame = { result: 'win', score: 70, opponentScore: 50, mode: 'ai' };
const winOnline: EvaluatedGame = { result: 'win', score: 70, opponentScore: 50, mode: 'online' };
const loss: EvaluatedGame = { result: 'loss', score: 30, opponentScore: 90, mode: 'ai' };

describe('achievements: no pay-to-win guardrail', () => {
  it('evaluator never touches GameState (byte-identical before & after)', () => {
    const state = createGameState([
      { id: 'p1', name: 'Alice', isAI: false },
      { id: 'p2', name: 'Bob', isAI: false },
    ]);
    const snapshot = JSON.stringify(state);

    evaluateAchievements(ctx({ thisGame: winAi }));
    evaluateAchievements(ctx({ thisGame: winOnline }));
    evaluateAchievements(ctx({ thisGame: loss }));

    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('all achievement IDs returned by evaluator exist in the catalog', () => {
    const known = new Set(ACHIEVEMENTS.map((a) => a.id));
    const got = new Set<string>();
    // Trigger every achievement at least once
    evaluateAchievements(ctx({ thisGame: winAi })).forEach((id) => got.add(id));
    evaluateAchievements(ctx({ thisGame: winOnline })).forEach((id) => got.add(id));
    evaluateAchievements(ctx({ thisGame: { ...winAi, score: 105 } })).forEach((id) => got.add(id));
    evaluateAchievements(ctx({ thisGame: { ...winAi, score: 95, opponentScore: 25 } })).forEach((id) => got.add(id));
    evaluateAchievements(
      ctx({
        thisGame: winAi,
        previousGames: [
          { result: 'win', mode: 'ai' },
          { result: 'win', mode: 'ai' },
        ],
      }),
    ).forEach((id) => got.add(id));

    for (const id of got) {
      expect(known.has(id)).toBe(true);
    }
  });
});

describe('achievements: first_win', () => {
  it('unlocks on first win', () => {
    const got = evaluateAchievements(ctx({ thisGame: winAi }));
    expect(got).toContain('first_win');
  });

  it('does not unlock on a loss', () => {
    const got = evaluateAchievements(ctx({ thisGame: loss }));
    expect(got).not.toContain('first_win');
  });

  it('does not unlock if already unlocked', () => {
    const got = evaluateAchievements(
      ctx({ thisGame: winAi, alreadyUnlocked: new Set(['first_win']) }),
    );
    expect(got).not.toContain('first_win');
  });
});

describe('achievements: first_online_win', () => {
  it('unlocks on first online win', () => {
    const got = evaluateAchievements(ctx({ thisGame: winOnline }));
    expect(got).toContain('first_online_win');
  });

  it('does not unlock for an AI win', () => {
    const got = evaluateAchievements(ctx({ thisGame: winAi }));
    expect(got).not.toContain('first_online_win');
  });
});

describe('achievements: centurion', () => {
  it('unlocks at 100 points', () => {
    const got = evaluateAchievements(ctx({ thisGame: { ...winAi, score: 100, opponentScore: 20 } }));
    expect(got).toContain('centurion');
  });

  it('does not unlock at 99 points', () => {
    const got = evaluateAchievements(ctx({ thisGame: { ...winAi, score: 99, opponentScore: 21 } }));
    expect(got).not.toContain('centurion');
  });
});

describe('achievements: landslide', () => {
  it('unlocks when winning by 60+', () => {
    const got = evaluateAchievements(ctx({ thisGame: { ...winAi, score: 90, opponentScore: 30 } }));
    expect(got).toContain('landslide');
  });

  it('does not unlock when winning by 59', () => {
    const got = evaluateAchievements(ctx({ thisGame: { ...winAi, score: 89, opponentScore: 30 } }));
    expect(got).not.toContain('landslide');
  });
});

describe('achievements: hat_trick', () => {
  it('unlocks on 3rd win in a row', () => {
    const got = evaluateAchievements(
      ctx({
        thisGame: winAi,
        previousGames: [
          { result: 'win', mode: 'ai' },
          { result: 'win', mode: 'online' },
        ],
      }),
    );
    expect(got).toContain('hat_trick');
  });

  it('does not unlock if any of the previous two was not a win', () => {
    const got = evaluateAchievements(
      ctx({
        thisGame: winAi,
        previousGames: [
          { result: 'win', mode: 'ai' },
          { result: 'loss', mode: 'ai' },
        ],
      }),
    );
    expect(got).not.toContain('hat_trick');
  });

  it('does not unlock if there are fewer than 2 previous games', () => {
    const got = evaluateAchievements(
      ctx({ thisGame: winAi, previousGames: [{ result: 'win', mode: 'ai' }] }),
    );
    expect(got).not.toContain('hat_trick');
  });
});

describe('achievement catalog', () => {
  it('every catalog entry has unique id', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every catalog entry has non-empty title, description, icon', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.title.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
      expect(a.icon.length).toBeGreaterThan(0);
      expect(a.xp).toBeGreaterThan(0);
    }
  });
});
