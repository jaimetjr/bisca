import { Card, GameState } from '../types';
import { createDeck } from './deck';
import { shuffleWith } from '../rng';

/**
 * Determinization for the PIMC search: turn the AI's partial-information view
 * of the game into a concrete full-information deal it can actually solve.
 */

/**
 * Every card the given player has not seen: the 40-card deck minus their own
 * hand, minus every card already captured by anyone, minus the cards sitting
 * in the trick currently being played, minus the face-up trump card.
 *
 * `lastTrick` needs no special handling — `completeTrick` has already moved
 * those cards into the winner's `capturedCards`, so they are covered.
 *
 * Invariant (asserted in tests): the result's length always equals the total
 * size of the other players' hands plus the remaining deck.
 */
export function unseenCards(state: GameState, playerId: string): Card[] {
  const seen = new Set<string>();

  const me = state.players.find(p => p.id === playerId);
  if (me) for (const c of me.hand) seen.add(c.id);

  for (const p of state.players) {
    for (const c of p.capturedCards) seen.add(c.id);
  }
  for (const tc of state.currentTrick) seen.add(tc.card.id);
  if (state.trumpCard) seen.add(state.trumpCard.id);

  return createDeck().filter(c => !seen.has(c.id));
}

/**
 * Sample one plausible world: deal the unseen cards out to the hidden players
 * (each keeping their known hand size) and leave the rest as the deck, in that
 * order.
 *
 * The trump card is deliberately left in the `trumpCard` slot rather than
 * shuffled into the deck — its position is not unknown. `completeTrick` only
 * hands it out once the deck is empty, so it is always the last card drawn,
 * and the AI can see its face. In 2v2 the AI's partner is hidden too and gets
 * determinized exactly like an opponent.
 *
 * Returns a fresh state; `state` is not mutated.
 */
export function sampleDeal(state: GameState, playerId: string, rng: () => number): GameState {
  const pool = shuffleWith(unseenCards(state, playerId), rng);
  let cursor = 0;

  const players = state.players.map(p => {
    if (p.id === playerId) return { ...p, hand: [...p.hand], capturedCards: [...p.capturedCards] };
    const hand = pool.slice(cursor, cursor + p.hand.length);
    cursor += p.hand.length;
    return { ...p, hand, capturedCards: [...p.capturedCards] };
  });

  return {
    ...state,
    players,
    deck: pool.slice(cursor),
    currentTrick: state.currentTrick.map(tc => ({ ...tc })),
    lastTrick: state.lastTrick ? state.lastTrick.map(tc => ({ ...tc })) : null,
  };
}
