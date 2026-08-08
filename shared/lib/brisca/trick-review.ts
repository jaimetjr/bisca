import { Card, Player, Suit, TrickCard } from '../types';
import { getCardPoints, determineTrickWinner } from './engine';
import { sameTeam } from './coach';

export interface TrickReview {
  reasonKey: string;
  params?: Record<string, number>;
  /** 'warn' costs the player something; 'good' is worth reinforcing. */
  tone: 'warn' | 'good';
}

/** Ace (11) and Three (10): the cards beginners throw away. */
const HIGH_VALUE_POINTS = 10;
/** A trick worth caring about either way. */
const VALUABLE_TRICK_POINTS = 10;

export interface TrickReviewInput {
  trick: TrickCard[];
  trumpSuit: Suit | null;
  players: Player[];
  playerId: string;
  /** The player's hand *including* the card they played this trick. */
  handBeforePlay: Card[];
}

/**
 * Looks at a finished trick and tells the player what their own choice cost or
 * earned them. The hint in `coach.ts` is an oracle you consult before playing;
 * this is the half that actually teaches, because it reacts to the move you
 * really made.
 *
 * **Only claims things the finished trick proves.** Whether a different card
 * would have gone better is usually unknowable — opponents who played after you
 * were responding to your card, so replaying the trick with a different one is
 * fiction. So "you could have won this" is only ever raised when the player had
 * the last seat, where their card alone settles the trick and no counterfactual
 * is involved. Everything else is stated from what is on the table: points that
 * changed hands, and cards that were spent.
 *
 * Returns null when there is no lesson worth interrupting for — silence beats a
 * banner that fires every trick and gets tuned out.
 *
 * Pure — does not mutate its inputs.
 */
export function reviewTrick({
  trick,
  trumpSuit,
  players,
  playerId,
  handBeforePlay,
}: TrickReviewInput): TrickReview | null {
  const myPlay = trick.find(tc => tc.playerId === playerId);
  if (trick.length === 0 || !myPlay) return null;

  const winnerId = determineTrickWinner(trick, trumpSuit);
  const iWon = sameTeam(players, winnerId, playerId);
  const pot = trick.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);
  const myPoints = getCardPoints(myPlay.card);
  const playedLast = trick[trick.length - 1].playerId === playerId;

  if (!iWon) {
    // Certain: those points are on the opponents' pile, and the player put them
    // there. The single most expensive beginner habit.
    if (myPoints >= HIGH_VALUE_POINTS) {
      return { reasonKey: 'review.gaveAwayPoints', params: { points: myPoints }, tone: 'warn' };
    }

    // Certain only from the last seat: with every other card already down, any
    // card in hand that beats the trick would have taken it.
    if (playedLast && pot >= VALUABLE_TRICK_POINTS) {
      const couldHaveWon = handBeforePlay.some(
        c => determineTrickWinner(
          trick.map(tc => (tc.playerId === playerId ? { playerId, card: c } : tc)),
          trumpSuit,
        ) === playerId,
      );
      if (couldHaveWon) {
        return { reasonKey: 'review.missedWin', params: { points: pot }, tone: 'warn' };
      }
    }

    // Losing a trick is fine; losing it for free is the goal.
    if (myPoints === 0) {
      return { reasonKey: 'review.lostCheap', tone: 'good' };
    }
    return null;
  }

  // Won it. Was the trump necessary?
  const isTrump = (c: Card) => c.suit === trumpSuit;
  if (playedLast && isTrump(myPlay.card) && trick[0].card.suit !== trumpSuit) {
    const cheaperWinner = handBeforePlay.some(
      c => !isTrump(c) && determineTrickWinner(
        trick.map(tc => (tc.playerId === playerId ? { playerId, card: c } : tc)),
        trumpSuit,
      ) === playerId,
    );
    if (cheaperWinner) {
      return { reasonKey: 'review.wastedTrump', tone: 'warn' };
    }
  }

  if (pot >= VALUABLE_TRICK_POINTS) {
    return { reasonKey: 'review.goodWin', params: { points: pot }, tone: 'good' };
  }
  return null;
}
