import { Card, GameState, Suit } from '../types';
import { getCardPoints, getCardStrength, determineTrickWinner } from './engine';

export interface Suggestion {
  card: Card;
  reasonKey: string;
  params?: Record<string, number>;
}

// A valuable trick worth committing a real card to (an Ace, a Three, or a
// couple of face cards on the table).
const VALUABLE_TRICK_POINTS = 10;

/** Ace (11) and Three (10) — the cards a beginner most often throws away. */
const HIGH_VALUE_POINTS = 10;

/** Cheapest-first: fewest points, then keep the trump, then lowest strength. */
export function cheapestFirst(trumpSuit: Suit | null) {
  const isTrump = (c: Card) => c.suit === trumpSuit;
  return (a: Card, b: Card) =>
    getCardPoints(a) - getCardPoints(b) ||
    Number(isTrump(a)) - Number(isTrump(b)) ||
    getCardStrength(a) - getCardStrength(b);
}

/** Whether `a` and `b` are on the same side. Undefined teams mean 1v1: never allies. */
export function sameTeam(
  players: GameState['players'],
  a: string,
  b: string,
): boolean {
  if (a === b) return true;
  const ta = players.find(p => p.id === a)?.team;
  const tb = players.find(p => p.id === b)?.team;
  return ta !== undefined && ta === tb;
}

/**
 * Beginner "coach": suggests which card to play and, crucially, *why*, using a
 * few transparent rules — unlike the PIMC search AI (ai-search.ts), whose move
 * choice has no human-readable rationale. Candidates are the player's whole
 * hand because offline play does not enforce follow-suit (see app/game.tsx),
 * so every card the player can see is a legal move.
 *
 * Two things the naive version got wrong, both of which matter because
 * `trick-review.ts` now judges the player against this advice:
 *
 * - **Position.** Playing last means the trick is settled by your choice; playing
 *   earlier leaves opponents behind you who can still take it. Committing an Ace
 *   or a Three from an early seat is how beginners hand over games.
 * - **Teams.** "Winning" meant *you* winning, so in 2v2 it advised overtaking
 *   your own partner. Practice is 1v1 today, but the rule is a pure function and
 *   should not carry a trap for whoever wires it into a partner game.
 *
 * Pure — does not mutate state.
 */
export function suggestPlay(state: GameState, playerId: string): Suggestion | null {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.hand.length === 0) return null;

  const trumpSuit = state.trumpSuit;
  const isTrump = (c: Card) => c.suit === trumpSuit;
  const byCheapest = cheapestFirst(trumpSuit);

  const weakest = [...player.hand].sort(byCheapest)[0];

  // Leading: don't hand over points — open with your weakest non-trump.
  if (state.currentTrick.length === 0) {
    return { card: weakest, reasonKey: 'coach.leadLow' };
  }

  const pot = state.currentTrick.reduce((sum, tc) => sum + getCardPoints(tc.card), 0);
  const isLastToPlay = state.currentTrick.length === state.players.length - 1;

  // An ally already holds the trick. Overtaking spends a card to win something
  // the team has; the useful move is either feeding it points (only safe when
  // nobody plays after you) or getting out of the way cheaply.
  const leaderId = determineTrickWinner(state.currentTrick, trumpSuit);
  if (leaderId !== playerId && sameTeam(state.players, leaderId, playerId)) {
    if (isLastToPlay) {
      const richest = [...player.hand].sort(byCheapest).reverse()[0];
      if (getCardPoints(richest) > 0) {
        return {
          card: richest,
          reasonKey: 'coach.feedPartner',
          params: { points: pot + getCardPoints(richest) },
        };
      }
    }
    return { card: weakest, reasonKey: 'coach.partnerHasIt' };
  }

  const winners = player.hand
    .filter(c => determineTrickWinner([...state.currentTrick, { playerId, card: c }], trumpSuit) === playerId)
    .sort(byCheapest);
  const cheapestWinner = winners[0];

  if (cheapestWinner) {
    const free = getCardPoints(cheapestWinner) === 0 && pot > 0;
    // Taking a fat trick is only *safe* from the last seat. From an earlier one
    // the card can still be beaten, and a beginner spending an Ace or a Three
    // there is exactly how points get handed over.
    const worthIt = pot >= VALUABLE_TRICK_POINTS &&
      (isLastToPlay || getCardPoints(cheapestWinner) < HIGH_VALUE_POINTS);

    if (free || worthIt) {
      return {
        card: cheapestWinner,
        reasonKey: isLastToPlay ? 'coach.winTrickSafe' : 'coach.winTrick',
        params: { points: pot + getCardPoints(cheapestWinner) },
      };
    }

    // Could win, but only by burning a high card from a seat that isn't safe.
    if (pot >= VALUABLE_TRICK_POINTS) {
      return { card: weakest, reasonKey: 'coach.tooRiskyToWin' };
    }
  }

  // Not worth spending a real card — discard the weakest and hold the trump.
  const keepingTrump = player.hand.some(isTrump) && !isTrump(weakest);
  return { card: weakest, reasonKey: keepingTrump ? 'coach.keepTrump' : 'coach.dumpLow' };
}
