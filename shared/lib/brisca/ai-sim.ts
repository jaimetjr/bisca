import { Card, GameState, Suit, CARD_POINTS, CARD_STRENGTH } from '../types';

/**
 * Simulation-only game state for the PIMC search.
 *
 * The engine's `playCard`/`completeTrick` are the source of truth, but they
 * deep-copy the whole state with `JSON.parse(JSON.stringify(...))` on every
 * call. Measured on a 2v2 midgame that capped the search at ~40–60k nodes/sec,
 * which meant the `hard` preset never got past one trick of lookahead inside
 * its 120ms budget — the configured depth of 4 was unreachable.
 *
 * This mirrors the same rules over a much cheaper representation:
 *  - captured cards are collapsed to a points counter (the search only ever
 *    reads the total, never the individual cards);
 *  - the deck is shared by reference and consumed with an index instead of
 *    being copied and shifted;
 *  - `Card` objects are treated as immutable values and shared, so applying a
 *    move copies only the small hand/trick arrays.
 *
 * Rule parity with the real engine is enforced by tests/unit/ai-sim.test.ts,
 * which replays identical games through both and compares every step.
 */

export interface SimTrickEntry {
  player: number;
  card: Card;
}

export interface SimState {
  hands: Card[][];
  /** Captured points per player — the real engine's `player.score`. */
  points: number[];
  /** Shared, never mutated; `deckPos` is the next card to be drawn. */
  deck: Card[];
  deckPos: number;
  trumpCard: Card | null;
  trumpSuit: Suit | null;
  trick: SimTrickEntry[];
  current: number;
  /** Side (team) per player index. */
  sides: number[];
  done: boolean;
}

export function cardPoints(card: Card): number {
  return CARD_POINTS[card.rank] || 0;
}

export function cardStrength(card: Card): number {
  return CARD_STRENGTH[card.rank] || 0;
}

export function toSimState(state: GameState): SimState {
  return {
    hands: state.players.map(p => [...p.hand]),
    points: state.players.map(p => p.score),
    deck: state.deck,
    deckPos: 0,
    trumpCard: state.trumpCard,
    trumpSuit: state.trumpSuit,
    trick: state.currentTrick.map(tc => ({
      player: state.players.findIndex(p => p.id === tc.playerId),
      card: tc.card,
    })),
    current: state.currentPlayerIndex,
    sides: state.players.map((p, i) => p.team ?? i),
    done: state.phase === 'gameOver',
  };
}

/**
 * Index-based mirror of the engine's `determineTrickWinner`. Same precedence:
 * trump beats non-trump, higher trump beats lower, otherwise only cards of the
 * lead suit can win and the highest one does.
 */
export function trickWinner(trick: SimTrickEntry[], trumpSuit: Suit | null): number {
  if (trick.length === 0) return -1;

  const leadSuit = trick[0].card.suit;
  let winner = trick[0].player;
  let winnerCard = trick[0].card;

  for (let i = 1; i < trick.length; i++) {
    const current = trick[i];
    const currentIsTrump = current.card.suit === trumpSuit;
    const winnerIsTrump = winnerCard.suit === trumpSuit;

    if (currentIsTrump && !winnerIsTrump) {
      winner = current.player;
      winnerCard = current.card;
    } else if (currentIsTrump && winnerIsTrump) {
      if (cardStrength(current.card) > cardStrength(winnerCard)) {
        winner = current.player;
        winnerCard = current.card;
      }
    } else if (!currentIsTrump && !winnerIsTrump) {
      if (current.card.suit === leadSuit && winnerCard.suit === leadSuit) {
        if (cardStrength(current.card) > cardStrength(winnerCard)) {
          winner = current.player;
          winnerCard = current.card;
        }
      } else if (current.card.suit === leadSuit && winnerCard.suit !== leadSuit) {
        winner = current.player;
        winnerCard = current.card;
      }
    }
  }

  return winner;
}

/** Cards the player to move may legally play. */
export function simLegalCards(state: SimState, strictFollowSuit: boolean): Card[] {
  const hand = state.hands[state.current];
  if (!strictFollowSuit || state.trick.length === 0) return hand;
  const leadSuit = state.trick[0].card.suit;
  const following = hand.filter(c => c.suit === leadSuit);
  return following.length > 0 ? following : hand;
}

/**
 * Play one card and, when that closes the trick, resolve it and replenish
 * hands. Returns a new state; `state` is untouched.
 *
 * The replenishment order and the "deck empty, hand out the face-up trump
 * last" rule follow `completeTrick` exactly.
 */
export function simApply(state: SimState, card: Card): SimState {
  const n = state.hands.length;
  const hands = state.hands.slice();
  const hand = hands[state.current].slice();
  const at = hand.findIndex(c => c.id === card.id);
  if (at === -1) return state;
  hand.splice(at, 1);
  hands[state.current] = hand;

  const trick = state.trick.concat({ player: state.current, card });

  if (trick.length < n) {
    return { ...state, hands, trick, current: (state.current + 1) % n };
  }

  const winner = trickWinner(trick, state.trumpSuit);
  const points = state.points.slice();
  for (const entry of trick) points[winner] += cardPoints(entry.card);

  let deckPos = state.deckPos;
  let trumpCard = state.trumpCard;

  if (deckPos < state.deck.length || trumpCard !== null) {
    for (let i = 0; i < n; i++) {
      const idx = (winner + i) % n;
      if (deckPos < state.deck.length) {
        hands[idx] = hands[idx].concat(state.deck[deckPos++]);
      } else if (trumpCard) {
        hands[idx] = hands[idx].concat(trumpCard);
        trumpCard = null;
      }
    }
  }

  const done = hands.every(h => h.length === 0);

  return {
    ...state,
    hands,
    points,
    deckPos,
    trumpCard,
    trick: [],
    // `completeTrick` only hands the lead to the winner when play continues;
    // on the final trick it leaves the index where it was. Nothing reads this
    // once the game is over, but matching exactly keeps the parity test a
    // strict oracle rather than one with a carve-out.
    current: done ? state.current : winner,
    done,
  };
}

/** Cards not yet captured: every hand, the undrawn deck, and the face-up trump. */
export function simAliveCards(state: SimState): Card[] {
  const alive: Card[] = [];
  for (const hand of state.hands) alive.push(...hand);
  for (let i = state.deckPos; i < state.deck.length; i++) alive.push(state.deck[i]);
  if (state.trumpCard) alive.push(state.trumpCard);
  return alive;
}

/** The two opposing side ids, in stable order. */
export function simSides(state: SimState): number[] {
  const seen: number[] = [];
  for (const s of state.sides) if (!seen.includes(s)) seen.push(s);
  return seen;
}

export function simOtherSide(state: SimState, side: number): number {
  return simSides(state).find(s => s !== side) ?? side;
}

export function simSideScore(state: SimState, side: number): number {
  let total = 0;
  for (let i = 0; i < state.points.length; i++) {
    if (state.sides[i] === side) total += state.points[i];
  }
  return total;
}
