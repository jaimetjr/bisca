import { describe, it, expect } from 'vitest';
import { suggestPlay } from '../../shared/lib/brisca/coach';
import { getCardPoints } from '../../shared/lib/brisca/engine';
import type { Card, GameState, Rank, Suit, TrickCard } from '../../shared/lib/types';

function card(suit: Suit, rank: Rank): Card {
  return { suit, rank, id: `${suit}-${rank}` };
}

function makeState(opts: {
  hand: Card[];
  currentTrick?: TrickCard[];
  trumpSuit?: Suit;
  playerId?: string;
}): GameState {
  const pid = opts.playerId ?? 'human';
  return {
    players: [
      { id: pid, name: 'You', hand: opts.hand, capturedCards: [], score: 0, isAI: false },
      { id: 'ai-1', name: 'Carlos', hand: [], capturedCards: [], score: 0, isAI: true },
    ],
    deck: [],
    trumpCard: null,
    trumpSuit: opts.trumpSuit ?? 'oros',
    currentTrick: opts.currentTrick ?? [],
    currentPlayerIndex: 0,
    leadPlayerIndex: 0,
    phase: 'playing',
    trickWinnerId: null,
    lastTrick: null,
  };
}

describe('suggestPlay', () => {
  it('leading: recommends a low non-trump card', () => {
    const state = makeState({
      hand: [card('copas', 1), card('copas', 5), card('bastos', 7)],
      trumpSuit: 'oros',
    });
    const res = suggestPlay(state, 'human');
    expect(res?.reasonKey).toBe('coach.leadLow');
    expect(getCardPoints(res!.card)).toBe(0);
    expect(res?.card.id).toBe('copas-5');
  });

  it('following: wins a valuable trick with the cheapest winning card', () => {
    const state = makeState({
      hand: [card('oros', 2), card('copas', 5), card('bastos', 6)],
      currentTrick: [{ playerId: 'ai-1', card: card('copas', 1) }], // Ace = 11 pts on the table
      trumpSuit: 'oros',
    });
    const res = suggestPlay(state, 'human');
    expect(res?.reasonKey).toBe('coach.winTrick');
    expect(res?.card.id).toBe('oros-2'); // cheap trump beats the non-trump Ace
    expect(res?.params?.points).toBe(11);
  });

  it('following: keeps the trump when the trick is worthless', () => {
    const state = makeState({
      hand: [card('oros', 12), card('copas', 4), card('bastos', 7)],
      currentTrick: [{ playerId: 'ai-1', card: card('copas', 5) }], // 0 pts on the table
      trumpSuit: 'oros',
    });
    const res = suggestPlay(state, 'human');
    expect(res?.reasonKey).toBe('coach.keepTrump');
    expect(res?.card.suit).not.toBe('oros'); // does not waste the trump
    expect(res?.card.id).toBe('copas-4');
  });

  it('following: dumps the weakest card when it has no trump and cannot win', () => {
    const state = makeState({
      hand: [card('copas', 5), card('bastos', 6), card('espadas', 7)],
      currentTrick: [{ playerId: 'ai-1', card: card('copas', 1) }], // Ace, unbeatable here
      trumpSuit: 'oros',
    });
    const res = suggestPlay(state, 'human');
    expect(res?.reasonKey).toBe('coach.dumpLow');
    expect(res?.card.id).toBe('copas-5');
  });

  it('always recommends a card that is actually in the hand', () => {
    const hand = [card('copas', 1), card('oros', 3), card('bastos', 7)];
    const state = makeState({ hand, trumpSuit: 'oros' });
    const res = suggestPlay(state, 'human');
    expect(hand.some(c => c.id === res!.card.id)).toBe(true);
  });

  it('returns null when the player is not found', () => {
    const state = makeState({ hand: [card('copas', 5)] });
    expect(suggestPlay(state, 'nobody')).toBeNull();
  });
});
