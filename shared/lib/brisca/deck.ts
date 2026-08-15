import { Card, RANKS, SUITS } from '../types';
import { shuffleWith } from '../rng';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, id: `${suit}-${rank}` });
    }
  }
  return deck;
}

/**
 * Fisher–Yates, with the generator injectable.
 *
 * The deal is the other half of what makes a game reproducible, and it was the
 * half nobody could reach. `ai-ladder.test.ts` seeded the AI's own draws and
 * then declared itself deterministic — but every game it played was dealt from
 * `Math.random`, so the difficulty margins it compares moved run to run and the
 * suite failed roughly one run in three on a comparison that was never wrong.
 *
 * Production passes nothing and keeps `Math.random`.
 */
export function shuffleDeck(deck: Card[], rng: () => number = Math.random): Card[] {
  return shuffleWith(deck, rng);
}

export function dealCards(deck: Card[], count: number): { dealt: Card[]; remaining: Card[] } {
  const dealt = deck.slice(0, count);
  const remaining = deck.slice(count);
  return { dealt, remaining };
}
