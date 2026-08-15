import { describe, it, expect } from 'vitest';
import { reviewTrick, lessonForTrick } from '../../shared/lib/brisca/trick-review';
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

/**
 * The one message the practice banner shows after a trick.
 *
 * These used to be two separate things in `app/game.tsx`: the review lived in
 * React state and survived until the player's next card, while the "who won"
 * recap was derived from `phase === 'trickComplete'` and died with it — 1500ms,
 * or 750ms on fast speed. `reviewTrick` returns null on most tricks by design,
 * so the short-lived one was the one the player saw most, and it flashed past.
 * One function, one message, one lifetime.
 */
describe('lessonForTrick', () => {
  const lesson = (trick: TrickCard[], handBeforePlay: Card[], players: Player[] = PLAYERS) =>
    lessonForTrick({ trick, trumpSuit: 'oros', players, playerId: 'me', handBeforePlay });

  it('prefere a lição sobre a sua jogada ao resumo de quem ganhou', () => {
    const l = lesson(
      [
        { playerId: 'me', card: card('copas', 1) },
        { playerId: 'ai-1', card: card('oros', 4) },
      ],
      [card('copas', 1), card('bastos', 5)],
    );
    expect(l?.key).toBe('review.gaveAwayPoints');
    expect(l?.tone).toBe('warn');
  });

  it('cai no resumo da vaza quando não há lição sobre a sua jogada', () => {
    // Won a cheap trick with no trump wasted: `reviewTrick` stays quiet on
    // purpose, and the banner falls back to who took it and why. This is the
    // majority case, and it is the one that used to vanish in 1500ms.
    const trick: TrickCard[] = [
      { playerId: 'ai-1', card: card('copas', 6) },
      { playerId: 'me', card: card('copas', 7) },
    ];
    expect(review(trick, [card('copas', 7)])).toBeNull();

    const l = lesson(trick, [card('copas', 7)]);
    expect(l).not.toBeNull();
    expect(l?.key).toBe('trickExplain.highestWinsNoPoints');
    expect(l?.tone).toBe('info');
    expect(l?.params?.winner).toBe('You');
  });

  it('nomeia o vencedor e os pontos no resumo', () => {
    // Lost to the Ace of trump holding only a Jack (2 pts): not cheap enough for
    // `review.lostCheap`, not expensive enough for `review.gaveAwayPoints`, and
    // nothing in hand that would have taken it. `reviewTrick` says nothing, so
    // the recap has to carry the trick — and has to stay up long enough to read.
    const trick: TrickCard[] = [
      { playerId: 'ai-1', card: card('oros', 1) },
      { playerId: 'me', card: card('copas', 10) },
    ];
    expect(review(trick, [card('copas', 10)])).toBeNull();

    const l = lesson(trick, [card('copas', 10)]);
    expect(l?.key).toBe('trickExplain.highestWins');
    expect(l?.tone).toBe('info');
    expect(l?.params?.winner).toBe('Carlos');
    expect(l?.params?.points).toBe(13);
  });

  it('devolve null quando não há vaza', () => {
    expect(lesson([], [])).toBeNull();
  });
});
