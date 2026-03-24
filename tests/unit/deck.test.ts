import { describe, it, expect } from 'vitest';
import { createDeck, shuffleDeck, dealCards } from '../../shared/lib/brisca/deck';
import { RANKS, SUITS } from '../../shared/lib/types';

describe('createDeck', () => {
  it('produces exactly 40 cards', () => {
    expect(createDeck()).toHaveLength(40);
  });

  it('contains every suit/rank combination', () => {
    const deck = createDeck();
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        expect(deck.some(c => c.suit === suit && c.rank === rank)).toBe(true);
      }
    }
  });

  it('has unique ids for every card', () => {
    const deck = createDeck();
    const ids = deck.map(c => c.id);
    expect(new Set(ids).size).toBe(40);
  });

  it('id format is suit-rank', () => {
    const deck = createDeck();
    for (const card of deck) {
      expect(card.id).toBe(`${card.suit}-${card.rank}`);
    }
  });
});

describe('shuffleDeck', () => {
  it('returns the same 40 cards', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled).toHaveLength(40);
    expect(shuffled.map(c => c.id).sort()).toEqual(deck.map(c => c.id).sort());
  });

  it('does not mutate the original deck', () => {
    const deck = createDeck();
    const original = deck.map(c => c.id);
    shuffleDeck(deck);
    expect(deck.map(c => c.id)).toEqual(original);
  });

  it('produces a different order from the original (statistical)', () => {
    // Run 5 times; at least one shuffle must differ from the sorted original
    const deck = createDeck();
    const original = deck.map(c => c.id).join(',');
    const anyDiffers = Array.from({ length: 5 }).some(() => {
      return shuffleDeck(deck).map(c => c.id).join(',') !== original;
    });
    expect(anyDiffers).toBe(true);
  });
});

describe('dealCards', () => {
  it('deals the requested number of cards', () => {
    const deck = createDeck();
    const { dealt } = dealCards(deck, 3);
    expect(dealt).toHaveLength(3);
  });

  it('remaining deck has the correct count', () => {
    const deck = createDeck();
    const { remaining } = dealCards(deck, 3);
    expect(remaining).toHaveLength(37);
  });

  it('no card appears in both dealt and remaining', () => {
    const deck = createDeck();
    const { dealt, remaining } = dealCards(deck, 3);
    const dealtIds = new Set(dealt.map(c => c.id));
    for (const card of remaining) {
      expect(dealtIds.has(card.id)).toBe(false);
    }
  });

  it('dealt cards come from the front of the deck', () => {
    const deck = createDeck();
    const { dealt } = dealCards(deck, 3);
    expect(dealt.map(c => c.id)).toEqual(deck.slice(0, 3).map(c => c.id));
  });

  it('deals 0 cards correctly', () => {
    const deck = createDeck();
    const { dealt, remaining } = dealCards(deck, 0);
    expect(dealt).toHaveLength(0);
    expect(remaining).toHaveLength(40);
  });
});
