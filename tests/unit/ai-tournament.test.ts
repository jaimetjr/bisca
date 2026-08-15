import { describe, it, expect } from 'vitest';
import { chooseAICard } from '../../shared/lib/brisca/ai';
import { chooseHeuristicCard } from '../../shared/lib/brisca/ai-heuristic';
import { createGameState, playCard, completeTrick } from '../../shared/lib/brisca/engine';
import { mulberry32 } from '../../shared/lib/rng';
import type { Card, GameState } from '../../shared/lib/types';

/**
 * Regression guard: the PIMC search must actually out-play the heuristic it
 * replaced. If this fails, the search has a bug — a correct lookahead cannot
 * lose to the depth-0 rules it uses for its own move ordering.
 *
 * Everything here is seeded and driven by a virtual clock, so the result is
 * deterministic and identical on every machine: no wall-clock budget means no
 * "passes on my laptop, fails in CI" flakiness.
 */

type Policy = (state: GameState, playerId: string) => Card | null;

// Reduced search budget so a few hundred full games fit in the default suite.
const SEARCH_BUDGET = { simulations: 4, maxTrickDepth: 2, epsilon: 0 };
// deadline = 0 + 1 and now() === 0, so the time check never trips.
const FROZEN_CLOCK = { nowMs: () => 0, timeBudgetMs: 1 };

function searchPolicy(rng: () => number): Policy {
  return (state, playerId) =>
    chooseAICard(state, playerId, 'hard', { ...SEARCH_BUDGET, ...FROZEN_CLOCK, rng });
}

function heuristicPolicy(rng: () => number): Policy {
  return (state, playerId) => chooseHeuristicCard(state, playerId, 'hard', { rng });
}

/**
 * Play one full game to completion and return each seat's final score.
 *
 * The deal is seeded along with the policies. Seeding only the policies left the
 * cards coming from `Math.random`, so the win rate this test thresholds moved
 * run to run — the same hole that had `ai-ladder` failing about one run in three.
 */
function playGame(policies: [Policy, Policy], rng: () => number): [number, number] {
  let state = createGameState([
    { id: 'p0', name: 'P0', isAI: true },
    { id: 'p1', name: 'P1', isAI: true },
  ], rng);

  let guard = 0;
  while (state.phase !== 'gameOver' && guard++ < 200) {
    while (state.phase === 'trickComplete') state = completeTrick(state);
    if (state.phase !== 'playing') break;

    const seat = state.currentPlayerIndex;
    const player = state.players[seat];
    const chosen = policies[seat](state, player.id);
    if (!chosen) throw new Error(`policy for ${player.id} returned no card`);
    state = playCard(state, player.id, chosen);
  }
  while (state.phase === 'trickComplete') state = completeTrick(state);

  return [state.players[0].score, state.players[1].score];
}

describe('PIMC search vs legacy heuristic', () => {
  it('wins consistently more than the heuristic it replaced', () => {
    const rng = mulberry32(20260722);
    const search = searchPolicy(rng);
    const heuristic = heuristicPolicy(rng);
    const games = 240;

    let searchWins = 0;
    let heuristicWins = 0;
    let draws = 0;
    let diffTotal = 0;

    for (let g = 0; g < games; g++) {
      // Alternate seats: createGameState always leads from index 0, and the
      // lead is worth real points, so a fixed seating would measure that
      // instead of skill.
      const searchSeat = g % 2;
      const policies: [Policy, Policy] =
        searchSeat === 0 ? [search, heuristic] : [heuristic, search];

      const scores = playGame(policies, rng);
      const searchScore = scores[searchSeat];
      const heuristicScore = scores[1 - searchSeat];

      diffTotal += searchScore - heuristicScore;
      if (searchScore > heuristicScore) searchWins++;
      else if (heuristicScore > searchScore) heuristicWins++;
      else draws++;
    }

    const winRate = (searchWins + draws / 2) / games;
    const meanDiff = diffTotal / games;

    // Reported on failure so a regression shows how far it fell, not just that it did.
    const summary =
      `search ${searchWins}W / ${heuristicWins}L / ${draws}D over ${games} games, ` +
      `winRate ${winRate.toFixed(3)}, meanPointDiff ${meanDiff.toFixed(2)}`;

    expect(winRate, summary).toBeGreaterThan(0.55);
    // Lower-variance statistic: catches erosion the win rate would round away.
    expect(meanDiff, summary).toBeGreaterThan(0);
  }, 600_000);
});
