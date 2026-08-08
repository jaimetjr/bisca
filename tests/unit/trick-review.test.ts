import { describe, it, expect } from 'vitest';
import { reviewTrick } from '../../shared/lib/brisca/trick-review';
import type { Card, Player, Rank, Suit, TrickCard } from '../../shared/lib/types';

const card = (suit: Suit, rank: Rank): Card => ({ suit, rank, id: `${suit}-${rank}` });

const PLAYERS: Player[] = [
  { id: 'me', name: 'You', hand: [], capturedCards: [], score: 0, isAI: false },
  { id: 'ai-1', name: 'Carlos', hand: [], capturedCards: [], score: 0, isAI: true },
];

function review(trick: TrickCard[], handBeforePlay: Card[], players: Player[] = PLAYERS) {
  return reviewTrick({ trick, trumpSuit: 'oros', players, playerId: 'me', handBeforePlay });
}

describe('reviewTrick', () => {
  it('avisa quando você entregou uma carta grande ao adversário', () => {
    // Led the Ace of copas (11 pts) and got trumped: those points are gone, and
    // no counterfactual is needed to say so.
    const r = review(
      [
        { playerId: 'me', card: card('copas', 1) },
        { playerId: 'ai-1', card: card('oros', 4) },
      ],
      [card('copas', 1), card('bastos', 5)],
    );
    expect(r?.reasonKey).toBe('review.gaveAwayPoints');
    expect(r?.params?.points).toBe(11);
    expect(r?.tone).toBe('warn');
  });

  it('avisa quando você jogou por último e deixou passar uma vaza gorda', () => {
    const r = review(
      [
        { playerId: 'ai-1', card: card('copas', 1) },
        { playerId: 'me', card: card('copas', 2) },
      ],
      [card('copas', 2), card('oros', 5)], // the trump would have taken it
    );
    expect(r?.reasonKey).toBe('review.missedWin');
    expect(r?.params?.points).toBe(11);
  });

  it('não acusa de perder a vaza quem não jogou por último', () => {
    // Leading, the player cannot know what comes after — claiming they "could
    // have won" would be inventing a trick that never happened.
    const r = review(
      [
        { playerId: 'me', card: card('copas', 2) },
        { playerId: 'ai-1', card: card('copas', 1) },
      ],
      [card('copas', 2), card('oros', 5)],
    );
    expect(r?.reasonKey).not.toBe('review.missedWin');
  });

  it('não acusa de deixar passar quando não havia carta vencedora na mão', () => {
    const r = review(
      [
        { playerId: 'ai-1', card: card('copas', 1) },
        { playerId: 'me', card: card('copas', 2) },
      ],
      [card('copas', 2), card('bastos', 4)], // nothing here beats the Ace
    );
    expect(r?.reasonKey).not.toBe('review.missedWin');
  });

  it('avisa quando o trunfo foi desperdiçado', () => {
    // Won from the last seat with a trump when a plain higher card of the lead
    // suit was in hand and would have taken it just the same.
    const r = review(
      [
        { playerId: 'ai-1', card: card('copas', 4) },
        { playerId: 'me', card: card('oros', 5) },
      ],
      [card('oros', 5), card('copas', 12)],
    );
    expect(r?.reasonKey).toBe('review.wastedTrump');
    expect(r?.tone).toBe('warn');
  });

  it('não chama de desperdício quando só o trunfo ganhava', () => {
    const r = review(
      [
        { playerId: 'ai-1', card: card('copas', 1) },
        { playerId: 'me', card: card('oros', 5) },
      ],
      [card('oros', 5), card('copas', 2)],
    );
    expect(r?.reasonKey).not.toBe('review.wastedTrump');
  });

  it('elogia vaza gorda ganha', () => {
    const r = review(
      [
        { playerId: 'ai-1', card: card('copas', 1) },
        { playerId: 'me', card: card('oros', 5) },
      ],
      [card('oros', 5)],
    );
    expect(r?.reasonKey).toBe('review.goodWin');
    expect(r?.tone).toBe('good');
  });

  it('elogia perder a vaza sem entregar ponto', () => {
    const r = review(
      [
        { playerId: 'ai-1', card: card('copas', 12) },
        { playerId: 'me', card: card('copas', 2) },
      ],
      [card('copas', 2)],
    );
    expect(r?.reasonKey).toBe('review.lostCheap');
    expect(r?.tone).toBe('good');
  });

  it('fica calado quando não há lição', () => {
    // Led low, lost a worthless trick: nothing happened worth a banner.
    const r = review(
      [
        { playerId: 'me', card: card('copas', 2) },
        { playerId: 'ai-1', card: card('copas', 4) },
      ],
      [card('copas', 2)],
    );
    expect(r?.reasonKey).toBe('review.lostCheap');
  });

  it('trata o parceiro como o próprio time', () => {
    const teamPlayers: Player[] = [
      { id: 'me', name: 'You', hand: [], capturedCards: [], score: 0, isAI: false, team: 1 },
      { id: 'ai-1', name: 'Carlos', hand: [], capturedCards: [], score: 0, isAI: true, team: 2 },
      { id: 'ai-2', name: 'Maria', hand: [], capturedCards: [], score: 0, isAI: true, team: 1 },
      { id: 'ai-3', name: 'Pedro', hand: [], capturedCards: [], score: 0, isAI: true, team: 2 },
    ];
    // The partner takes the trick with the Ace, so feeding the Three into it is
    // points for the team — never "you gave away 10 points".
    const r = review(
      [
        { playerId: 'ai-2', card: card('copas', 1) },
        { playerId: 'ai-1', card: card('copas', 4) },
        { playerId: 'me', card: card('copas', 3) },
        { playerId: 'ai-3', card: card('copas', 5) },
      ],
      [card('copas', 3)],
      teamPlayers,
    );
    expect(r?.reasonKey).not.toBe('review.gaveAwayPoints');
    expect(r?.tone).toBe('good');
  });

  it('devolve null para vaza vazia ou sem a sua carta', () => {
    expect(review([], [])).toBeNull();
    expect(review([{ playerId: 'ai-1', card: card('copas', 1) }], [])).toBeNull();
  });
});
