import { describe, it, expect, beforeAll } from 'vitest';
import { chooseAICard } from '../../shared/lib/brisca/ai';
import { createGameState, playCard, completeTrick } from '../../shared/lib/brisca/engine';
import { mulberry32 } from '../../shared/lib/rng';
import type { AIDifficulty, Card, GameState } from '../../shared/lib/types';

/**
 * The three difficulty presets must form a real ladder: hard beats medium,
 * medium beats easy, and hard beats easy by the widest margin of all. This is
 * the guard the plain win-rate tournament test can't give — it would still
 * pass if someone quietly made `medium` as strong as `hard`, or `easy` as
 * strong as `medium`.
 *
 * The wall-clock cutoff is disabled (nowMs is frozen at 0), so each difficulty
 * runs its true intrinsic config — simulations, maxTrickDepth and epsilon from
 * AI_SEARCH_CONFIG — to completion. That makes the whole thing deterministic
 * and machine-independent: it measures the strength baked into the presets,
 * not how fast the test host happens to be, so it cannot flake. On a real
 * device the differing time budgets (easy 15ms → hard 120ms) only widen these
 * gaps further, never narrow them.
 */

type Policy = (s: GameState, id: string) => Card | null;

function policy(diff: AIDifficulty, rng: () => number): Policy {
  return (s, id) => chooseAICard(s, id, diff, { nowMs: () => 0, rng });
}

function playGame(seat0: Policy, seat1: Policy): [number, number] {
  let state = createGameState([
    { id: 'p0', name: 'P0', isAI: true },
    { id: 'p1', name: 'P1', isAI: true },
  ]);
  const policies = [seat0, seat1];
  let guard = 0;
  while (state.phase !== 'gameOver' && guard++ < 300) {
    while (state.phase === 'trickComplete') state = completeTrick(state);
    if (state.phase !== 'playing') break;
    const seat = state.currentPlayerIndex;
    const p = state.players[seat];
    const card = policies[seat](state, p.id);
    if (!card) throw new Error(`no card for ${p.id}`);
    state = playCard(state, p.id, card);
  }
  while (state.phase === 'trickComplete') state = completeTrick(state);
  return [state.players[0].score, state.players[1].score];
}

interface Duel {
  winRate: number;
  meanDiff: number;
  summary: string;
}

/** `strong` vs `weak`, seats alternating so the lead advantage cancels out. */
function duel(strong: AIDifficulty, weak: AIDifficulty, games: number): Duel {
  const rng = mulberry32(20260723);
  const sp = policy(strong, rng);
  const wp = policy(weak, rng);

  let sWins = 0;
  let wWins = 0;
  let draws = 0;
  let diff = 0;

  for (let g = 0; g < games; g++) {
    const strongFirst = g % 2 === 0;
    const [s0, s1] = strongFirst ? playGame(sp, wp) : playGame(wp, sp);
    const strongScore = strongFirst ? s0 : s1;
    const weakScore = strongFirst ? s1 : s0;
    diff += strongScore - weakScore;
    if (strongScore > weakScore) sWins++;
    else if (weakScore > strongScore) wWins++;
    else draws++;
  }

  const winRate = (sWins + draws / 2) / games;
  const meanDiff = diff / games;
  return {
    winRate,
    meanDiff,
    summary:
      `${strong} vs ${weak}: ${sWins}W/${wWins}L/${draws}D over ${games} games, ` +
      `winRate ${winRate.toFixed(3)}, meanPointDiff ${meanDiff.toFixed(2)}`,
  };
}

describe('difficulty ladder', () => {
  // 24 games per pairing keeps this near the existing tournament test's cost.
  // It is deterministic, so a fixed count is a fixed outcome, not a sample —
  // the thresholds below sit well clear of the observed values and exist to
  // catch a broken ordering, not statistical noise. Every pairing is computed
  // once here (the deep hard-vs-medium duel is the expensive one) and reused
  // across the assertions below.
  const GAMES = 24;
  let hardMedium: Duel;
  let mediumEasy: Duel;
  let hardEasy: Duel;

  beforeAll(() => {
    hardMedium = duel('hard', 'medium', GAMES);
    mediumEasy = duel('medium', 'easy', GAMES);
    hardEasy = duel('hard', 'easy', GAMES);
  }, 300_000);

  it('hard beats medium', () => {
    expect(hardMedium.winRate, hardMedium.summary).toBeGreaterThan(0.55);
    expect(hardMedium.meanDiff, hardMedium.summary).toBeGreaterThan(0);
  });

  it('medium beats easy', () => {
    expect(mediumEasy.winRate, mediumEasy.summary).toBeGreaterThan(0.55);
    expect(mediumEasy.meanDiff, mediumEasy.summary).toBeGreaterThan(0);
  });

  it('hard beats easy by the widest margin', () => {
    expect(hardEasy.winRate, hardEasy.summary).toBeGreaterThan(0.70);
    expect(hardEasy.meanDiff, hardEasy.summary).toBeGreaterThan(0);

    // The extremes must be at least as separated as an adjacent step — if this
    // inverts, `easy` has accidentally become competitive with `hard`.
    expect(
      hardEasy.winRate,
      `expected hard-vs-easy (${hardEasy.winRate.toFixed(3)}) ` +
        `to exceed hard-vs-medium (${hardMedium.winRate.toFixed(3)})`,
    ).toBeGreaterThan(hardMedium.winRate);
  });
});
