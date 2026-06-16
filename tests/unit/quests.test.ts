import { describe, it, expect } from 'vitest';
import { createGameState } from '../../shared/lib/brisca/engine';
import {
  pickTodaysQuests,
  utcDateString,
  deltaForQuest,
} from '../../shared/lib/quests/evaluator';
import { QUESTS, QUEST_BY_ID } from '../../shared/lib/quests/definitions';
import { QUESTS_PER_DAY } from '../../shared/lib/quests/types';
import type { EvaluatedGame } from '../../shared/lib/achievements/evaluator';

const winAi: EvaluatedGame = { result: 'win', score: 70, opponentScore: 50, mode: 'ai' };
const winOnlineBig: EvaluatedGame = { result: 'win', score: 105, opponentScore: 15, mode: 'online' };
const lossAi: EvaluatedGame = { result: 'loss', score: 25, opponentScore: 95, mode: 'ai' };

describe('quests: no pay-to-win guardrail', () => {
  it('quest evaluators never touch GameState (byte-identical before & after)', () => {
    const state = createGameState([
      { id: 'p1', name: 'Alice', isAI: false },
      { id: 'p2', name: 'Bob', isAI: false },
    ]);
    const snapshot = JSON.stringify(state);

    for (const q of QUESTS) {
      deltaForQuest(q, winAi);
      deltaForQuest(q, winOnlineBig);
      deltaForQuest(q, lossAi);
    }

    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('every quest evalDelta returns a non-negative integer', () => {
    for (const q of QUESTS) {
      for (const game of [winAi, winOnlineBig, lossAi]) {
        const d = q.evalDelta(game);
        expect(Number.isInteger(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('quests: catalog', () => {
  it('all quest IDs are unique', () => {
    const ids = QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every quest has positive target and xp', () => {
    for (const q of QUESTS) {
      expect(q.target).toBeGreaterThan(0);
      expect(q.xp).toBeGreaterThan(0);
      expect(q.title.length).toBeGreaterThan(0);
      expect(q.description.length).toBeGreaterThan(0);
    }
  });
});

describe('quests: pickTodaysQuests', () => {
  it('returns exactly QUESTS_PER_DAY entries', () => {
    const got = pickTodaysQuests('2026-05-04');
    expect(got).toHaveLength(QUESTS_PER_DAY);
  });

  it('is deterministic — same date returns the same picks', () => {
    const a = pickTodaysQuests('2026-05-04').map((q) => q.id);
    const b = pickTodaysQuests('2026-05-04').map((q) => q.id);
    expect(a).toEqual(b);
  });

  it('different dates produce a different mix at least sometimes', () => {
    // Test a span of dates and ensure we don't always get the same triplet.
    const triplets = new Set<string>();
    for (let day = 1; day <= 30; day++) {
      const d = `2026-05-${String(day).padStart(2, '0')}`;
      triplets.add(pickTodaysQuests(d).map((q) => q.id).sort().join(','));
    }
    expect(triplets.size).toBeGreaterThan(1);
  });

  it('all picks are valid catalog entries', () => {
    const picks = pickTodaysQuests('2026-05-04');
    for (const p of picks) {
      expect(QUEST_BY_ID.has(p.id)).toBe(true);
    }
  });
});

describe('quests: utcDateString', () => {
  it('formats as YYYY-MM-DD', () => {
    const s = utcDateString(new Date('2026-05-04T03:14:15.926Z'));
    expect(s).toBe('2026-05-04');
  });

  it('is UTC-based — same instant reads the same regardless of locale', () => {
    const t = new Date('2026-12-31T23:30:00.000Z');
    expect(utcDateString(t)).toBe('2026-12-31');
  });
});

describe('quests: deltaForQuest', () => {
  it('play_3: any game contributes 1', () => {
    const q = QUEST_BY_ID.get('play_3')!;
    expect(deltaForQuest(q, winAi)).toBe(1);
    expect(deltaForQuest(q, lossAi)).toBe(1);
  });

  it('win_2: only wins contribute', () => {
    const q = QUEST_BY_ID.get('win_2')!;
    expect(deltaForQuest(q, winAi)).toBe(1);
    expect(deltaForQuest(q, lossAi)).toBe(0);
  });

  it('score_80: only games scoring 80+ contribute', () => {
    const q = QUEST_BY_ID.get('score_80')!;
    expect(deltaForQuest(q, { ...winAi, score: 80 })).toBe(1);
    expect(deltaForQuest(q, { ...winAi, score: 79 })).toBe(0);
  });

  it('online_1: only online mode contributes', () => {
    const q = QUEST_BY_ID.get('online_1')!;
    expect(deltaForQuest(q, winOnlineBig)).toBe(1);
    expect(deltaForQuest(q, winAi)).toBe(0);
  });

  it('centurion_today: only 100+ score contributes', () => {
    const q = QUEST_BY_ID.get('centurion_today')!;
    expect(deltaForQuest(q, { ...winAi, score: 100 })).toBe(1);
    expect(deltaForQuest(q, { ...winAi, score: 99 })).toBe(0);
  });
});
