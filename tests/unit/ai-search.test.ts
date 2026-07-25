import { describe, it, expect } from 'vitest';
import { chooseAICard } from '../../shared/lib/brisca/ai';
import { chooseHeuristicCard } from '../../shared/lib/brisca/ai-heuristic';
import { evaluate, sidesOf, sideOf } from '../../shared/lib/brisca/ai-search';
import type { SearchStats } from '../../shared/lib/brisca/ai-search';
import { unseenCards, sampleDeal } from '../../shared/lib/brisca/ai-determinize';
import {
  createGameState,
  playCard,
  completeTrick,
  legalCards,
  getCardPoints,
} from '../../shared/lib/brisca/engine';
import { createDeck } from '../../shared/lib/brisca/deck';
import { mulberry32 } from '../../shared/lib/rng';
import type { Card, GameState, Rank, Suit } from '../../shared/lib/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Card ids are `${suit}-${rank}` (deck.ts), so this matches real deck cards. */
function card(suit: Suit, rank: Rank): Card {
  return { suit, rank, id: `${suit}-${rank}` };
}

function oneVsOne(): GameState {
  return createGameState([
    { id: 'ai', name: 'AI', isAI: true },
    { id: 'human', name: 'Human', isAI: false },
  ]);
}

function twoVsTwo(): GameState {
  return createGameState([
    { id: 'ai', name: 'AI', isAI: true, team: 1 },
    { id: 'o1', name: 'O1', isAI: true, team: 2 },
    { id: 'p2', name: 'P2', isAI: true, team: 1 },
    { id: 'o2', name: 'O2', isAI: true, team: 2 },
  ]);
}

/** Advance a game by `plies` random legal moves, so tests see mid-hand states. */
function advance(state: GameState, plies: number, rng: () => number): GameState {
  let s = state;
  for (let i = 0; i < plies; i++) {
    while (s.phase === 'trickComplete') s = completeTrick(s);
    if (s.phase !== 'playing') break;
    const player = s.players[s.currentPlayerIndex];
    const options = legalCards(s, player.id);
    if (options.length === 0) break;
    s = playCard(s, player.id, options[Math.floor(rng() * options.length)]);
  }
  while (s.phase === 'trickComplete') s = completeTrick(s);
  return s;
}

// ─── 1. Legality ─────────────────────────────────────────────────────────────

describe('chooseAICard — legality', () => {
  it('never picks a card outside legalCards when suit-following is enforced', () => {
    const rng = mulberry32(1234);
    for (let game = 0; game < 12; game++) {
      for (const seed of [oneVsOne(), twoVsTwo()]) {
        let state = advance(seed, Math.floor(rng() * 12), rng);
        while (state.phase === 'playing') {
          const player = state.players[state.currentPlayerIndex];
          const allowed = new Set(legalCards(state, player.id).map(c => c.id));
          const chosen = chooseAICard(state, player.id, 'hard', {
            strictFollowSuit: true,
            rng,
            simulations: 2,
            maxTrickDepth: 2,
          });
          expect(chosen).not.toBeNull();
          expect(allowed.has(chosen!.id)).toBe(true);

          state = playCard(state, player.id, chosen!);
          while (state.phase === 'trickComplete') state = completeTrick(state);
        }
      }
    }
  });

  it('picks from the whole hand when suit-following is off (offline rules)', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 20; i++) {
      const state = advance(oneVsOne(), Math.floor(rng() * 20), rng);
      if (state.phase !== 'playing') continue;
      const player = state.players[state.currentPlayerIndex];
      const inHand = new Set(player.hand.map(c => c.id));
      const chosen = chooseAICard(state, player.id, 'hard', {
        rng,
        simulations: 2,
        maxTrickDepth: 2,
      });
      expect(inHand.has(chosen!.id)).toBe(true);
    }
  });
});

// ─── Deadline hardening ──────────────────────────────────────────────────────

describe('chooseAICard — depth-1 always completes', () => {
  /**
   * Even with the time budget already blown, the first search pass must run to
   * completion so the bot never silently collapses to the plain heuristic on a
   * slow device. A clock that jumps far past the deadline right after the start
   * marker forces that worst case: without the guarantee the depth-1 sweep
   * would abort and `depthReached` would be 0.
   */
  function expiredClock(): () => number {
    let calls = 0;
    return () => (calls++ === 0 ? 0 : 1e9);
  }

  it('reaches at least depth 1 with a zero time budget (1v1 and 2v2)', () => {
    for (const seed of [oneVsOne(), twoVsTwo()]) {
      const state = advance(seed, 6, mulberry32(123));
      if (state.phase !== 'playing') continue;
      const id = state.players[state.currentPlayerIndex].id;
      const stats: SearchStats = { nodes: 0, depthReached: 0, elapsedMs: 0 };
      const chosen = chooseAICard(state, id, 'hard', {
        rng: mulberry32(9),
        timeBudgetMs: 0,
        nowMs: expiredClock(),
        stats,
      });
      expect(chosen).not.toBeNull();
      expect(stats.depthReached).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── 2. Determinization invariants ───────────────────────────────────────────

describe('determinization', () => {
  it('unseen count equals hidden hands plus remaining deck', () => {
    const rng = mulberry32(7);
    for (const seed of [oneVsOne(), twoVsTwo()]) {
      for (let i = 0; i < 15; i++) {
        const state = advance(seed, Math.floor(rng() * 25), rng);
        const hidden = state.players
          .filter(p => p.id !== 'ai')
          .reduce((sum, p) => sum + p.hand.length, 0);
        expect(unseenCards(state, 'ai').length).toBe(hidden + state.deck.length);
      }
    }
  });

  it('never leaks the AI own cards, the trump card, or duplicates into a sample', () => {
    const rng = mulberry32(2024);
    for (const seed of [oneVsOne(), twoVsTwo()]) {
      for (let i = 0; i < 15; i++) {
        const state = advance(seed, Math.floor(rng() * 25), rng);
        const sample = sampleDeal(state, 'ai', rng);

        const mine = new Set(state.players.find(p => p.id === 'ai')!.hand.map(c => c.id));
        const hidden = sample.players.filter(p => p.id !== 'ai').flatMap(p => p.hand);

        for (const c of hidden) expect(mine.has(c.id)).toBe(false);
        if (state.trumpCard) {
          expect(hidden.some(c => c.id === state.trumpCard!.id)).toBe(false);
          expect(sample.deck.some(c => c.id === state.trumpCard!.id)).toBe(false);
          expect(sample.trumpCard?.id).toBe(state.trumpCard.id);
        }

        // Whole sampled world still contains all 40 distinct cards exactly once.
        const all = [
          ...sample.players.flatMap(p => [...p.hand, ...p.capturedCards]),
          ...sample.deck,
          ...sample.currentTrick.map(tc => tc.card),
          ...(sample.trumpCard ? [sample.trumpCard] : []),
        ];
        expect(new Set(all.map(c => c.id)).size).toBe(createDeck().length);
        expect(all.length).toBe(createDeck().length);
      }
    }
  });

  it('preserves each hidden player hand size', () => {
    const rng = mulberry32(555);
    const state = advance(twoVsTwo(), 9, rng);
    const sample = sampleDeal(state, 'ai', rng);
    for (const p of state.players) {
      expect(sample.players.find(q => q.id === p.id)!.hand.length).toBe(p.hand.length);
    }
  });
});

// ─── 3. Endgame ──────────────────────────────────────────────────────────────

/**
 * Independent oracle: exhaustive minimax to the terminal state, no alpha-beta,
 * no evaluation function. Only usable on tiny endgames, which is the point —
 * it validates the real search rather than restating it.
 */
function exactValue(state: GameState, side: number): number {
  let s = state;
  while (s.phase === 'trickComplete') s = completeTrick(s);

  const score = (st: GameState) =>
    st.players.reduce((sum, p) => sum + (sideOf(p, st.players) === side ? p.score : -p.score), 0);

  if (s.phase === 'gameOver') return score(s);

  const player = s.players[s.currentPlayerIndex];
  if (player.hand.length === 0) return score(s);

  const maximizing = sideOf(player, s.players) === side;
  let best = maximizing ? -Infinity : Infinity;
  for (const c of player.hand) {
    const v = exactValue(playCard(s, player.id, c), side);
    best = maximizing ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}

/**
 * Hand-built endgame: deck exhausted, trump already drawn, three cards each,
 * AI on lead, trump espadas. Leading copas-10 is uniquely optimal and beats
 * the legacy heuristic's pick by a 12-point swing — exactly the misplay class
 * this engine was built to fix: the heuristic reflexively dumps a worthless
 * card, when the winning line is to lead the 2-point Sota.
 *
 * The 34 cards not in either hand must be dealt into the capture piles. A
 * position that simply omits them is not a reachable game state: `unseenCards`
 * would report 37 candidates and the determinization would deal the opponent a
 * random hand, so the search would solve the wrong deals entirely.
 */
function endgame(): GameState {
  const aiHand = [card('oros', 7), card('espadas', 7), card('copas', 10)];
  const humanHand = [card('copas', 12), card('oros', 3), card('espadas', 4)];

  const inHand = new Set([...aiHand, ...humanHand].map(c => c.id));
  const spent = createDeck().filter(c => !inHand.has(c.id));
  // Tricks are two cards in 1v1, so each capture pile must hold an even count.
  const aiCaptured = spent.slice(0, 18);
  const humanCaptured = spent.slice(18);
  const points = (cards: Card[]) => cards.reduce((sum, c) => sum + getCardPoints(c), 0);

  return {
    players: [
      {
        id: 'ai',
        name: 'AI',
        hand: aiHand,
        capturedCards: aiCaptured,
        score: points(aiCaptured),
        isAI: true,
      },
      {
        id: 'human',
        name: 'Human',
        hand: humanHand,
        capturedCards: humanCaptured,
        score: points(humanCaptured),
        isAI: false,
      },
    ],
    deck: [],
    trumpCard: null,
    trumpSuit: 'espadas',
    currentTrick: [],
    currentPlayerIndex: 0,
    leadPlayerIndex: 0,
    phase: 'playing',
    trickWinnerId: null,
    lastTrick: null,
  };
}

describe('chooseAICard — endgame', () => {
  it('finds an optimal move in a solved endgame', () => {
    const state = endgame();
    const side = sideOf(state.players[0], state.players);

    const values = state.players[0].hand.map(c => ({
      card: c,
      value: exactValue(playCard(state, 'ai', c), side),
    }));
    const bestValue = Math.max(...values.map(v => v.value));
    const optimalIds = new Set(values.filter(v => v.value === bestValue).map(v => v.card.id));

    // Sanity: the position must actually discriminate, otherwise the test is vacuous.
    expect(optimalIds.size).toBeLessThan(state.players[0].hand.length);

    // The deck is empty and every other card is accounted for in the capture
    // piles, so the unseen set is exactly the opponent's hand: every
    // determinization is the true deal and the search is exact here. Without
    // this the fixture would silently degrade into guessing.
    expect(unseenCards(state, 'ai').length).toBe(state.players[1].hand.length);
    const chosen = chooseAICard(state, 'ai', 'hard', {
      rng: mulberry32(3),
      epsilon: 0,
      simulations: 1,
    });
    expect(chosen).not.toBeNull();
    expect(optimalIds.has(chosen!.id)).toBe(true);
  });

  it('beats the legacy heuristic in that same endgame', () => {
    const state = endgame();
    const side = sideOf(state.players[0], state.players);
    const valueOf = (c: Card) => exactValue(playCard(state, 'ai', c), side);

    const searched = chooseAICard(state, 'ai', 'hard', {
      rng: mulberry32(3),
      epsilon: 0,
      simulations: 1,
    })!;
    const heuristic = chooseHeuristicCard(state, 'ai', 'hard')!;

    expect(valueOf(searched)).toBeGreaterThan(valueOf(heuristic));
  });
});

/** Build a reachable 1v1 endgame from card ids — deck empty, piles filled. */
function buildEndgame(aiIds: string[], humanIds: string[], trump: Suit): GameState {
  const byId = new Map(createDeck().map(c => [c.id, c] as const));
  const aiHand = aiIds.map(id => byId.get(id)!);
  const humanHand = humanIds.map(id => byId.get(id)!);
  const inHand = new Set([...aiIds, ...humanIds]);
  const spent = createDeck().filter(c => !inHand.has(c.id));
  const aiCaptured = spent.slice(0, 18);
  const humanCaptured = spent.slice(18);
  const points = (cards: Card[]) => cards.reduce((sum, c) => sum + getCardPoints(c), 0);

  return {
    players: [
      { id: 'ai', name: 'AI', hand: aiHand, capturedCards: aiCaptured, score: points(aiCaptured), isAI: true },
      { id: 'human', name: 'Human', hand: humanHand, capturedCards: humanCaptured, score: points(humanCaptured), isAI: false },
    ],
    deck: [],
    trumpCard: null,
    trumpSuit: trump,
    currentTrick: [],
    currentPlayerIndex: 0,
    leadPlayerIndex: 0,
    phase: 'playing',
    trickWinnerId: null,
    lastTrick: null,
  };
}

/**
 * A spread of solved endgames — one per trump suit — each found by exhaustive
 * search to have a unique-ish best lead that the legacy heuristic misses. This
 * turns the single narrated case above into a small battery, so a regression
 * in the endgame has to survive four independent oracle checks, not one.
 */
const ENDGAMES: { trump: Suit; ai: string[]; human: string[] }[] = [
  { trump: 'copas',   ai: ['bastos-11', 'copas-5', 'oros-12'],  human: ['oros-3', 'copas-6', 'copas-11'] },
  { trump: 'bastos',  ai: ['copas-1', 'copas-6', 'espadas-1'],  human: ['oros-11', 'espadas-11', 'copas-10'] },
  { trump: 'oros',    ai: ['espadas-3', 'bastos-1', 'espadas-5'], human: ['oros-7', 'espadas-10', 'oros-1'] },
  { trump: 'espadas', ai: ['espadas-7', 'copas-3', 'copas-12'], human: ['oros-6', 'espadas-1', 'oros-1'] },
];

describe('chooseAICard — endgame battery (varied trumps)', () => {
  it('every position is a fully-determined, discriminating deal', () => {
    for (const pos of ENDGAMES) {
      const state = buildEndgame(pos.ai, pos.human, pos.trump);
      // Deck empty and all other cards spent → the single determinization is
      // the true deal, so the search is exact.
      expect(unseenCards(state, 'ai').length, JSON.stringify(pos)).toBe(state.players[1].hand.length);

      const side = sideOf(state.players[0], state.players);
      const values = state.players[0].hand.map(c => exactValue(playCard(state, 'ai', c), side));
      const best = Math.max(...values);
      const optimalCount = values.filter(v => v === best).length;
      // Not every move optimal, else the assertion below is vacuous.
      expect(optimalCount, JSON.stringify(pos)).toBeLessThan(3);
    }
  });

  it('search picks an optimal card in every position', () => {
    for (const pos of ENDGAMES) {
      const state = buildEndgame(pos.ai, pos.human, pos.trump);
      const side = sideOf(state.players[0], state.players);
      const values = state.players[0].hand.map(c => ({ id: c.id, v: exactValue(playCard(state, 'ai', c), side) }));
      const best = Math.max(...values.map(x => x.v));
      const optimal = new Set(values.filter(x => x.v === best).map(x => x.id));

      const chosen = chooseAICard(state, 'ai', 'hard', { rng: mulberry32(7), epsilon: 0, simulations: 1 })!;
      expect(optimal.has(chosen.id), `trump ${pos.trump}, chose ${chosen.id}`).toBe(true);
    }
  });

  it('outscores the legacy heuristic summed across the battery', () => {
    let searchTotal = 0;
    let heuristicTotal = 0;
    for (const pos of ENDGAMES) {
      const state = buildEndgame(pos.ai, pos.human, pos.trump);
      const side = sideOf(state.players[0], state.players);
      const valueOf = (c: Card) => exactValue(playCard(state, 'ai', c), side);

      const searched = chooseAICard(state, 'ai', 'hard', { rng: mulberry32(7), epsilon: 0, simulations: 1 })!;
      const heuristic = chooseHeuristicCard(state, 'ai', 'hard')!;
      searchTotal += valueOf(searched);
      heuristicTotal += valueOf(heuristic);
    }
    expect(searchTotal).toBeGreaterThan(heuristicTotal);
  });
});

// ─── 4. Determinism ──────────────────────────────────────────────────────────

describe('chooseAICard — determinism', () => {
  it('returns the same card for the same seed with epsilon 0', () => {
    const state = advance(oneVsOne(), 6, mulberry32(41));
    if (state.phase !== 'playing') throw new Error('setup produced a finished game');
    const pick = () =>
      chooseAICard(state, state.players[state.currentPlayerIndex].id, 'hard', {
        rng: mulberry32(2000),
        epsilon: 0,
      })!.id;
    expect(pick()).toBe(pick());
    expect(pick()).toBe(pick());
  });

  it('epsilon 1 always diverges from the top-ranked card', () => {
    const state = advance(oneVsOne(), 4, mulberry32(17));
    const id = state.players[state.currentPlayerIndex].id;
    const best = chooseAICard(state, id, 'hard', { rng: mulberry32(5), epsilon: 0 })!;
    const noisy = chooseAICard(state, id, 'hard', { rng: mulberry32(5), epsilon: 1 })!;
    expect(noisy.id).not.toBe(best.id);
  });
});

// ─── 5. Evaluation side-symmetry ─────────────────────────────────────────────

describe('evaluate — side symmetry', () => {
  /**
   * A one-sided evaluation biases every search that bottoms out at a cutoff,
   * and shows up only as a quiet win-rate drop. This is the guard for tuning
   * AI_HAND_POTENTIAL_WEIGHT or handPotential later.
   */
  function assertSymmetric(state: GameState) {
    const [a, b] = sidesOf(state);
    expect(sidesOf(state)).toHaveLength(2);
    expect(evaluate(state, a)).toBeCloseTo(-evaluate(state, b), 10);
  }

  it('holds on a hand-built 1v1 position with captures and a partial trick', () => {
    assertSymmetric({
      players: [
        {
          id: 'ai',
          name: 'AI',
          hand: [card('oros', 1), card('copas', 5)],
          capturedCards: [card('espadas', 12), card('espadas', 4)],
          score: 4,
          isAI: true,
        },
        {
          id: 'human',
          name: 'Human',
          hand: [card('bastos', 3), card('bastos', 6), card('copas', 11)],
          capturedCards: [card('copas', 1), card('copas', 2), card('espadas', 3)],
          score: 21,
          isAI: false,
        },
      ],
      deck: [card('oros', 7), card('bastos', 10)],
      trumpCard: card('oros', 4),
      trumpSuit: 'oros',
      currentTrick: [{ playerId: 'human', card: card('bastos', 12) }],
      currentPlayerIndex: 0,
      leadPlayerIndex: 1,
      phase: 'playing',
      trickWinnerId: null,
      lastTrick: null,
    });
  });

  it('holds on a hand-built 2v2 position with an asymmetric partial trick', () => {
    assertSymmetric({
      players: [
        {
          id: 'ai', name: 'AI', team: 1,
          hand: [card('oros', 3), card('copas', 6)],
          capturedCards: [card('espadas', 1)], score: 11, isAI: true,
        },
        {
          id: 'o1', name: 'O1', team: 2,
          hand: [card('bastos', 1), card('bastos', 4)],
          capturedCards: [card('copas', 12), card('copas', 4)], score: 4, isAI: true,
        },
        {
          id: 'p2', name: 'P2', team: 1,
          hand: [card('espadas', 5), card('espadas', 7)],
          capturedCards: [], score: 0, isAI: true,
        },
        {
          id: 'o2', name: 'O2', team: 2,
          hand: [card('copas', 3), card('bastos', 11)],
          capturedCards: [card('espadas', 10)], score: 2, isAI: true,
        },
      ],
      deck: [card('oros', 5), card('oros', 6), card('bastos', 2)],
      trumpCard: card('oros', 12),
      trumpSuit: 'oros',
      currentTrick: [
        { playerId: 'p2', card: card('espadas', 11) },
        { playerId: 'o2', card: card('espadas', 2) },
      ],
      currentPlayerIndex: 0,
      leadPlayerIndex: 2,
      phase: 'playing',
      trickWinnerId: null,
      lastTrick: null,
    });
  });

  it('holds across many randomly reached mid-hand positions', () => {
    const rng = mulberry32(808);
    for (const seed of [oneVsOne(), twoVsTwo()]) {
      for (let i = 0; i < 40; i++) {
        assertSymmetric(advance(seed, Math.floor(rng() * 30), rng));
      }
    }
  });
});
