import { Player, Suit, TrickCard } from '../types';
import { getCardPoints, determineTrickWinner } from './engine';

export interface TrickExplanation {
  winnerId: string;
  winnerName: string;
  reasonKey: string;
  points: number;
}

/**
 * Explains a just-completed trick for the practice coach: who won, why (a
 * trump beat the lead suit, or the highest card of the lead suit won), and how
 * many points it was worth. Derived entirely from the `trickComplete` state
 * (see app/game.tsx) — no engine change needed.
 *
 * Pure — does not mutate its inputs.
 */
export function explainTrick(
  trick: TrickCard[],
  trumpSuit: Suit | null,
  players: Player[],
): TrickExplanation | null {
  if (trick.length === 0) return null;

  const winnerId = determineTrickWinner(trick, trumpSuit);
  const winningPlay = trick.find(tc => tc.playerId === winnerId);
  if (!winningPlay) return null;

  const leadSuit = trick[0].card.suit;
  const wonByTrump = winningPlay.card.suit === trumpSuit && leadSuit !== trumpSuit;
  const points = trick.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);

  return {
    winnerId,
    winnerName: players.find(p => p.id === winnerId)?.name ?? '',
    reasonKey: wonByTrump ? 'trickExplain.trumpWins' : 'trickExplain.highestWins',
    points,
  };
}
