import { Card, GameState } from '../types';
import { getCardPoints, getCardStrength, determineTrickWinner } from './engine';

export interface Suggestion {
  card: Card;
  reasonKey: string;
  params?: Record<string, number>;
}

// A valuable trick worth committing a real card to (an Ace, a Three, or a
// couple of face cards on the table).
const VALUABLE_TRICK_POINTS = 10;

/**
 * Beginner "coach": suggests which card to play and, crucially, *why*, using a
 * few transparent rules — unlike the PIMC search AI (ai-search.ts), whose move
 * choice has no human-readable rationale. Candidates are the player's whole
 * hand because offline play does not enforce follow-suit (see app/game.tsx),
 * so every card the player can see is a legal move.
 *
 * Pure — does not mutate state.
 */
export function suggestPlay(state: GameState, playerId: string): Suggestion | null {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.hand.length === 0) return null;

  const trumpSuit = state.trumpSuit;
  const isTrump = (c: Card) => c.suit === trumpSuit;

  // Cheapest-first: fewest points, then keep the trump, then lowest strength.
  const byCheapest = (a: Card, b: Card) =>
    getCardPoints(a) - getCardPoints(b) ||
    Number(isTrump(a)) - Number(isTrump(b)) ||
    getCardStrength(a) - getCardStrength(b);

  const weakest = [...player.hand].sort(byCheapest)[0];

  // Leading: don't hand over points — open with your weakest non-trump.
  if (state.currentTrick.length === 0) {
    return { card: weakest, reasonKey: 'coach.leadLow' };
  }

  const pot = state.currentTrick.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);
  const winners = player.hand
    .filter(c => determineTrickWinner([...state.currentTrick, { playerId, card: c }], trumpSuit) === playerId)
    .sort(byCheapest);
  const cheapestWinner = winners[0];

  // Win when the trick is worth it, or when it can be taken for free.
  if (cheapestWinner && (pot >= VALUABLE_TRICK_POINTS || (getCardPoints(cheapestWinner) === 0 && pot > 0))) {
    return {
      card: cheapestWinner,
      reasonKey: 'coach.winTrick',
      params: { points: pot + getCardPoints(cheapestWinner) },
    };
  }

  // Not worth spending a real card — discard the weakest and hold the trump.
  const keepingTrump = player.hand.some(isTrump) && !isTrump(weakest);
  return { card: weakest, reasonKey: keepingTrump ? 'coach.keepTrump' : 'coach.dumpLow' };
}
