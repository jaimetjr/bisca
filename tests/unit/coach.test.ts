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
    // In 1v1 the follower is also the last seat, so the advice can promise the
    // trick rather than merely recommend going for it.
    expect(res?.reasonKey).toBe('coach.winTrickSafe');
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

/**
 * Seat awareness. `trick-review.ts` judges the player against this advice, so
 * advice that ignores who plays after them would produce accusations the player
 * doesn't deserve.
 */
describe('suggestPlay — posição na vaza', () => {
  function make4p(hand: Card[], currentTrick: TrickCard[]): GameState {
    return {
      players: [
        { id: 'human', name: 'You', hand, capturedCards: [], score: 0, isAI: false, team: 1 },
        { id: 'ai-1', name: 'Carlos', hand: [], capturedCards: [], score: 0, isAI: true, team: 2 },
        { id: 'ai-2', name: 'Maria', hand: [], capturedCards: [], score: 0, isAI: true, team: 1 },
        { id: 'ai-3', name: 'Pedro', hand: [], capturedCards: [], score: 0, isAI: true, team: 2 },
      ],
      deck: [],
      trumpCard: null,
      trumpSuit: 'oros',
      currentTrick,
      currentPlayerIndex: 0,
      leadPlayerIndex: 0,
      phase: 'playing',
      trickWinnerId: null,
      lastTrick: null,
    } as unknown as GameState;
  }

  it('não queima uma carta grande de um assento que ainda pode ser coberto', () => {
    // Second of four with 11 points on the table: the only winner is the Three
    // of trumps, and two opponents still play after. Spending it here is how
    // beginners hand over games.
    const state = make4p(
      [card('oros', 3), card('copas', 2), card('bastos', 5)],
      [{ playerId: 'ai-1', card: card('copas', 1) }],
    );
    const res = suggestPlay(state, 'human');
    expect(res?.reasonKey).toBe('coach.tooRiskyToWin');
    expect(res?.card.id).not.toBe('oros-3');
  });

  it('manda ficar fora do caminho quando o parceiro está ganhando', () => {
    // Partner leads the Ace and is winning; the old rule filtered on "where *I*
    // win" and told the player to trump over their own side.
    const state = make4p(
      [card('oros', 3), card('copas', 2), card('bastos', 5)],
      [
        { playerId: 'ai-2', card: card('copas', 1) },
        { playerId: 'ai-1', card: card('copas', 4) },
      ],
    );
    const res = suggestPlay(state, 'human');
    expect(res?.reasonKey).toBe('coach.partnerHasIt');
    expect(res?.card.id).not.toBe('oros-3');
  });

  it('manda alimentar o parceiro quando ninguém joga depois', () => {
    const state = make4p(
      [card('oros', 3), card('copas', 2)],
      [
        { playerId: 'ai-2', card: card('copas', 1) },
        { playerId: 'ai-1', card: card('copas', 4) },
        { playerId: 'ai-3', card: card('copas', 5) },
      ],
    );
    const res = suggestPlay(state, 'human');
    expect(res?.reasonKey).toBe('coach.feedPartner');
    expect(res?.card.id).toBe('oros-3'); // the points go to the team
  });
});
