import { describe, it, expect } from 'vitest';
import { explainTrick } from '../../shared/lib/brisca/trick-explain';
import type { Card, Player, Rank, Suit, TrickCard } from '../../shared/lib/types';

function card(suit: Suit, rank: Rank): Card {
  return { suit, rank, id: `${suit}-${rank}` };
}

function player(id: string, name: string): Player {
  return { id, name, hand: [], capturedCards: [], score: 0, isAI: false };
}

const PLAYERS = [player('human', 'You'), player('ai-1', 'Carlos')];

describe('explainTrick', () => {
  it('explains a trump beating the lead suit', () => {
    const trick: TrickCard[] = [
      { playerId: 'ai-1', card: card('copas', 1) }, // Ace of the lead suit, 11 pts
      { playerId: 'human', card: card('oros', 2) },  // trump, 0 pts
    ];
    const res = explainTrick(trick, 'oros', PLAYERS);
    expect(res?.winnerId).toBe('human');
    expect(res?.winnerName).toBe('You');
    expect(res?.reasonKey).toBe('trickExplain.trumpWins');
    expect(res?.points).toBe(11);
  });

  it('explains the highest card of the lead suit winning', () => {
    const trick: TrickCard[] = [
      { playerId: 'ai-1', card: card('copas', 12) }, // King, 4 pts
      { playerId: 'human', card: card('copas', 1) },  // Ace, strongest, 11 pts
    ];
    const res = explainTrick(trick, 'oros', PLAYERS);
    expect(res?.winnerId).toBe('human');
    expect(res?.reasonKey).toBe('trickExplain.highestWins');
    expect(res?.points).toBe(15);
  });

  it('treats a trump-led trick as highest-wins, not trumpWins', () => {
    const trick: TrickCard[] = [
      { playerId: 'ai-1', card: card('oros', 5) },
      { playerId: 'human', card: card('oros', 12) }, // higher trump
    ];
    const res = explainTrick(trick, 'oros', PLAYERS);
    expect(res?.winnerId).toBe('human');
    expect(res?.reasonKey).toBe('trickExplain.highestWins');
  });

  it('returns null for an empty trick', () => {
    expect(explainTrick([], 'oros', PLAYERS)).toBeNull();
  });
});
