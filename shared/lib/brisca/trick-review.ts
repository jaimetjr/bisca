import { Card, Player, Suit, TrickCard } from '../types';
import { getCardPoints, determineTrickWinner } from './engine';
import { sameTeam } from './coach';
import { explainTrick } from './trick-explain';

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

/** A message for the practice-mode coach banner. */
export interface CoachLesson {
  key: string;
  params?: Record<string, string | number>;
  tone: 'warn' | 'good' | 'info';
}

/**
 * The single message the coach banner shows once a trick is finished: what the
 * player's own move cost or earned if there is anything to say, and otherwise
 * who took the trick and why.
 *
 * These were two separate things in `app/game.tsx`, and that is what made the
 * banner flicker past: the review was held in state and lasted until the
 * player's next card, while the recap was derived from `phase ===
 * 'trickComplete'` and disappeared the moment the engine moved on — 1500ms at
 * normal speed and 750ms at fast. `reviewTrick` deliberately stays quiet on most
 * tricks, so the short-lived branch was the one the player saw most often.
 *
 * Producing both from one call is what lets the screen hold one value with one
 * lifetime. Order is the precedence: a lesson about your own move beats a recap
 * of who won.
 *
 * Pure — does not mutate its inputs.
 */
export function lessonForTrick(input: TrickReviewInput): CoachLesson | null {
  const review = reviewTrick(input);
  if (review) return { key: review.reasonKey, params: review.params, tone: review.tone };

  const info = explainTrick(input.trick, input.trumpSuit, input.players);
  if (!info) return null;
  return {
    key: info.reasonKey,
    params: { winner: info.winnerName, points: info.points },
    tone: 'info',
  };
}
