import { describe, it, expect } from 'vitest';
import {
  getCardPoints,
  getCardStrength,
  determineTrickWinner,
  createGameState,
  playCard,
  completeTrick,
} from '../../shared/lib/brisca/engine';
import type { Card, TrickCard } from '../../shared/lib/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function card(rank: Card['rank'], suit: Card['suit'] = 'oros'): Card {
  return { rank, suit, id: `${suit}-${rank}` };
}

function trick(entries: Array<[string, Card]>): TrickCard[] {
  return entries.map(([playerId, c]) => ({ playerId, card: c }));
}

function twoPlayerState() {
  return createGameState([
    { id: 'p1', name: 'Alice', isAI: false },
    { id: 'p2', name: 'Bob', isAI: false },
  ]);
}

// ─── getCardPoints ───────────────────────────────────────────────────────────

describe('getCardPoints', () => {
  it('Ace = 11', () => expect(getCardPoints(card(1))).toBe(11));
  it('Three = 10', () => expect(getCardPoints(card(3))).toBe(10));
  it('King (12) = 4', () => expect(getCardPoints(card(12))).toBe(4));
  it('Knight (11) = 3', () => expect(getCardPoints(card(11))).toBe(3));
  it('Jack (10) = 2', () => expect(getCardPoints(card(10))).toBe(2));
  it('2 = 0', () => expect(getCardPoints(card(2))).toBe(0));
  it('4 = 0', () => expect(getCardPoints(card(4))).toBe(0));
  it('5 = 0', () => expect(getCardPoints(card(5))).toBe(0));
  it('6 = 0', () => expect(getCardPoints(card(6))).toBe(0));
  it('7 = 0', () => expect(getCardPoints(card(7))).toBe(0));
});

// ─── getCardStrength ─────────────────────────────────────────────────────────

describe('getCardStrength', () => {
  it('Ace is strongest', () => {
    const ranks: Card['rank'][] = [3, 12, 11, 10, 7, 6, 5, 4, 2];
    for (const r of ranks) {
      expect(getCardStrength(card(1))).toBeGreaterThan(getCardStrength(card(r)));
    }
  });

  it('Three is second strongest', () => {
    const ranks: Card['rank'][] = [12, 11, 10, 7, 6, 5, 4, 2];
    for (const r of ranks) {
      expect(getCardStrength(card(3))).toBeGreaterThan(getCardStrength(card(r)));
    }
  });

  it('full strength order: 1 > 3 > 12 > 11 > 10 > 7 > 6 > 5 > 4 > 2', () => {
    const order: Card['rank'][] = [1, 3, 12, 11, 10, 7, 6, 5, 4, 2];
    for (let i = 0; i < order.length - 1; i++) {
      expect(getCardStrength(card(order[i]))).toBeGreaterThan(getCardStrength(card(order[i + 1])));
    }
  });
});

// ─── determineTrickWinner ────────────────────────────────────────────────────

describe('determineTrickWinner', () => {
  it('returns empty string for empty trick', () => {
    expect(determineTrickWinner([], 'oros')).toBe('');
  });

  it('single card always wins', () => {
    expect(determineTrickWinner(trick([['p1', card(2)]]), 'oros')).toBe('p1');
  });

  it('trump beats lead suit', () => {
    const t = trick([
      ['p1', card(1, 'bastos')], // Ace of lead suit
      ['p2', card(2, 'oros')],   // 2 of trump
    ]);
    expect(determineTrickWinner(t, 'oros')).toBe('p2');
  });

  it('higher rank in lead suit wins when no trump', () => {
    const t = trick([
      ['p1', card(2, 'copas')],
      ['p2', card(7, 'copas')],
    ]);
    expect(determineTrickWinner(t, 'espadas')).toBe('p2');
  });

  it('Ace beats Three in same suit', () => {
    const t = trick([
      ['p1', card(3, 'bastos')],
      ['p2', card(1, 'bastos')],
    ]);
    expect(determineTrickWinner(t, 'oros')).toBe('p2');
  });

  it('higher trump beats lower trump', () => {
    const t = trick([
      ['p1', card(7, 'oros')],
      ['p2', card(3, 'oros')],
    ]);
    expect(determineTrickWinner(t, 'oros')).toBe('p2');
  });

  it('off-suit non-trump card loses to lead suit', () => {
    const t = trick([
      ['p1', card(2, 'copas')],  // lead suit
      ['p2', card(1, 'bastos')], // Ace but wrong suit, no trump
    ]);
    expect(determineTrickWinner(t, 'oros')).toBe('p1');
  });

  it('first trump in multi-player trick beats lead Ace', () => {
    const t = trick([
      ['p1', card(1, 'copas')],  // Ace of lead
      ['p2', card(4, 'bastos')], // off-suit, loses
      ['p3', card(2, 'oros')],   // trump, wins
    ]);
    expect(determineTrickWinner(t, 'oros')).toBe('p3');
  });
});

// ─── createGameState ─────────────────────────────────────────────────────────

describe('createGameState', () => {
  it('creates the correct number of players', () => {
    const state = twoPlayerState();
    expect(state.players).toHaveLength(2);
  });

  it('deals 3 cards per player', () => {
    const state = twoPlayerState();
    for (const p of state.players) {
      expect(p.hand).toHaveLength(3);
    }
  });

  it('sets trump card from the last deck card', () => {
    const state = twoPlayerState();
    expect(state.trumpCard).not.toBeNull();
    expect(state.trumpSuit).toBe(state.trumpCard?.suit);
  });

  it('deck has 40 - (3 * players) - 1 (trump) cards', () => {
    const state = twoPlayerState();
    // 40 total - 6 dealt - 1 trump shown = 33 in deck
    expect(state.deck).toHaveLength(33);
  });

  it('total card count is always 40', () => {
    const state = twoPlayerState();
    const total =
      state.deck.length +
      (state.trumpCard ? 1 : 0) +
      state.players.reduce((s, p) => s + p.hand.length, 0);
    expect(total).toBe(40);
  });

  it('phase starts as playing', () => {
    expect(twoPlayerState().phase).toBe('playing');
  });

  it('currentPlayerIndex starts at 0', () => {
    expect(twoPlayerState().currentPlayerIndex).toBe(0);
  });

  it('all cards are unique across players and deck', () => {
    const state = twoPlayerState();
    const allIds = [
      ...state.deck.map(c => c.id),
      ...(state.trumpCard ? [state.trumpCard.id] : []),
      ...state.players.flatMap(p => p.hand.map(c => c.id)),
    ];
    expect(new Set(allIds).size).toBe(40);
  });
});

// ─── playCard ────────────────────────────────────────────────────────────────

describe('playCard', () => {
  it('removes the card from the player hand', () => {
    const state = twoPlayerState();
    const p1 = state.players[0];
    const cardToPlay = p1.hand[0];
    const next = playCard(state, p1.id, cardToPlay);
    expect(next.players[0].hand.map(c => c.id)).not.toContain(cardToPlay.id);
  });

  it('adds the card to currentTrick', () => {
    const state = twoPlayerState();
    const p1 = state.players[0];
    const cardToPlay = p1.hand[0];
    const next = playCard(state, p1.id, cardToPlay);
    expect(next.currentTrick).toHaveLength(1);
    expect(next.currentTrick[0].card.id).toBe(cardToPlay.id);
  });

  it('advances currentPlayerIndex', () => {
    const state = twoPlayerState();
    const p1 = state.players[0];
    const next = playCard(state, p1.id, p1.hand[0]);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('sets phase to trickComplete when all players have played', () => {
    let state = twoPlayerState();
    state = playCard(state, state.players[0].id, state.players[0].hand[0]);
    state = playCard(state, state.players[1].id, state.players[1].hand[0]);
    expect(state.phase).toBe('trickComplete');
  });

  it('sets trickWinnerId when trick is complete', () => {
    let state = twoPlayerState();
    state = playCard(state, state.players[0].id, state.players[0].hand[0]);
    state = playCard(state, state.players[1].id, state.players[1].hand[0]);
    expect(state.trickWinnerId).not.toBeNull();
  });

  it('returns original state unchanged for invalid playerId', () => {
    const state = twoPlayerState();
    const result = playCard(state, 'nobody', state.players[0].hand[0]);
    expect(result).toBe(state);
  });
});

// ─── completeTrick ───────────────────────────────────────────────────────────

describe('completeTrick', () => {
  function stateAfterTrick() {
    let state = twoPlayerState();
    state = playCard(state, state.players[0].id, state.players[0].hand[0]);
    state = playCard(state, state.players[1].id, state.players[1].hand[0]);
    return state;
  }

  it('clears the currentTrick', () => {
    const after = completeTrick(stateAfterTrick());
    expect(after.currentTrick).toHaveLength(0);
  });

  it('awards points to the winner', () => {
    const before = stateAfterTrick();
    const after = completeTrick(before);
    const totalPoints = after.players.reduce((s, p) => s + p.score, 0);
    // Points scored so far should equal trick card points
    const trickPoints = before.currentTrick.reduce(
      (s, tc) => s + getCardPoints(tc.card), 0
    );
    expect(totalPoints).toBe(trickPoints);
  });

  it('winner draws a new card from the deck', () => {
    const before = stateAfterTrick();
    const deckSize = before.deck.length;
    const after = completeTrick(before);
    // Each player draws one card; deck shrinks by player count
    const newDeckSize = after.deck.length;
    expect(deckSize - newDeckSize).toBeGreaterThanOrEqual(1);
  });

  it('returns to playing phase', () => {
    expect(completeTrick(stateAfterTrick()).phase).toBe('playing');
  });

  it('phase becomes gameOver when all hands are empty and deck exhausted', () => {
    // Simulate a minimal game: force phase to gameOver by playing all cards
    let state = createGameState([
      { id: 'p1', name: 'A', isAI: false },
      { id: 'p2', name: 'B', isAI: false },
    ]);

    // Play through the entire deck
    while (state.phase !== 'gameOver') {
      const current = state.players[state.currentPlayerIndex];
      state = playCard(state, current.id, current.hand[0]);
      if (state.phase === 'trickComplete') {
        state = completeTrick(state);
      }
    }

    expect(state.phase).toBe('gameOver');
  });

  it('total score across all players equals 120 at game end', () => {
    let state = createGameState([
      { id: 'p1', name: 'A', isAI: false },
      { id: 'p2', name: 'B', isAI: false },
    ]);

    while (state.phase !== 'gameOver') {
      const current = state.players[state.currentPlayerIndex];
      state = playCard(state, current.id, current.hand[0]);
      if (state.phase === 'trickComplete') {
        state = completeTrick(state);
      }
    }

    const total = state.players.reduce((s, p) => s + p.score, 0);
    expect(total).toBe(120);
  });
});
