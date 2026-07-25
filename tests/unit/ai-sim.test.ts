import { describe, it, expect } from 'vitest';
import {
  createGameState,
  playCard,
  completeTrick,
  legalCards,
  determineTrickWinner,
} from '../../shared/lib/brisca/engine';
import {
  toSimState,
  simApply,
  simLegalCards,
  trickWinner,
  SimState,
} from '../../shared/lib/brisca/ai-sim';
import { mulberry32 } from '../../shared/lib/rng';
import type { GameState } from '../../shared/lib/types';

/**
 * The search runs on SimState instead of the real engine for speed, so it is
 * only trustworthy if the two agree on the rules. These tests replay identical
 * games through both and compare every observable at every step.
 */

function oneVsOne(): GameState {
  return createGameState([
    { id: 'a', name: 'A', isAI: true },
    { id: 'b', name: 'B', isAI: true },
  ]);
}

function twoVsTwo(): GameState {
  return createGameState([
    { id: 'a', name: 'A', isAI: true, team: 1 },
    { id: 'b', name: 'B', isAI: true, team: 2 },
    { id: 'c', name: 'C', isAI: true, team: 1 },
    { id: 'd', name: 'D', isAI: true, team: 2 },
  ]);
}

function snapshotReal(state: GameState) {
  return {
    hands: state.players.map(p => p.hand.map(c => c.id)),
    points: state.players.map(p => p.score),
    deck: state.deck.map(c => c.id),
    trumpCard: state.trumpCard?.id ?? null,
    trick: state.currentTrick.map(tc => `${tc.playerId}:${tc.card.id}`),
    current: state.currentPlayerIndex,
    done: state.phase === 'gameOver',
  };
}

function snapshotSim(sim: SimState, ids: string[]) {
  return {
    hands: sim.hands.map(h => h.map(c => c.id)),
    points: sim.points.slice(),
    deck: sim.deck.slice(sim.deckPos).map(c => c.id),
    trumpCard: sim.trumpCard?.id ?? null,
    trick: sim.trick.map(t => `${ids[t.player]}:${t.card.id}`),
    current: sim.current,
    done: sim.done,
  };
}

describe('SimState — parity with the real engine', () => {
  it('matches the engine step by step across full random games', () => {
    const rng = mulberry32(4242);

    for (const seed of [oneVsOne, twoVsTwo]) {
      for (let game = 0; game < 25; game++) {
        let real = seed();
        let sim = toSimState(real);
        const ids = real.players.map(p => p.id);

        expect(snapshotSim(sim, ids)).toEqual(snapshotReal(real));

        let guard = 0;
        while (real.phase !== 'gameOver' && guard++ < 200) {
          const player = real.players[real.currentPlayerIndex];
          const options = legalCards(real, player.id);
          const card = options[Math.floor(rng() * options.length)];

          // The engine needs an explicit trick settlement; simApply folds it in.
          real = playCard(real, player.id, card);
          while (real.phase === 'trickComplete') real = completeTrick(real);
          sim = simApply(sim, card);

          expect(snapshotSim(sim, ids)).toEqual(snapshotReal(real));
        }

        expect(sim.done).toBe(true);
        // Every point in the deck ends up captured by someone.
        expect(sim.points.reduce((a, b) => a + b, 0)).toBe(120);
      }
    }
  });

  it('agrees with determineTrickWinner on every reachable trick', () => {
    const rng = mulberry32(31337);

    for (const seed of [oneVsOne, twoVsTwo]) {
      for (let game = 0; game < 15; game++) {
        let real = seed();
        let guard = 0;

        while (real.phase !== 'gameOver' && guard++ < 200) {
          const player = real.players[real.currentPlayerIndex];
          const options = legalCards(real, player.id);
          const card = options[Math.floor(rng() * options.length)];
          real = playCard(real, player.id, card);

          if (real.currentTrick.length > 0) {
            const expectedId = determineTrickWinner(real.currentTrick, real.trumpSuit);
            const sim = toSimState(real);
            expect(real.players[trickWinner(sim.trick, sim.trumpSuit)].id).toBe(expectedId);
          }

          while (real.phase === 'trickComplete') real = completeTrick(real);
        }
      }
    }
  });

  it('mirrors legalCards under both rulesets', () => {
    const rng = mulberry32(8080);

    for (const seed of [oneVsOne, twoVsTwo]) {
      let real = seed();
      let guard = 0;

      while (real.phase !== 'gameOver' && guard++ < 200) {
        const player = real.players[real.currentPlayerIndex];
        const sim = toSimState(real);

        expect(simLegalCards(sim, true).map(c => c.id))
          .toEqual(legalCards(real, player.id).map(c => c.id));
        // Suit-following off: the whole hand is available.
        expect(simLegalCards(sim, false).map(c => c.id))
          .toEqual(player.hand.map(c => c.id));

        const options = legalCards(real, player.id);
        real = playCard(real, player.id, options[Math.floor(rng() * options.length)]);
        while (real.phase === 'trickComplete') real = completeTrick(real);
      }
    }
  });
});
