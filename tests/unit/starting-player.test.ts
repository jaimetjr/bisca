import { describe, it, expect } from 'vitest';
import { createGameState, nextStarter } from '../../shared/lib/brisca/engine';
import { mulberry32 } from '../../shared/lib/rng';

/**
 * Who leads the first trick.
 *
 * The engine used to hard-code seat 0, which meant the human always led offline
 * and the host always led online. The lead is worth real points — the AI test
 * suites alternate seats precisely to cancel it — so a fixed leader was a
 * standing advantage for one player.
 *
 * The randomness deliberately lives in the callers, not here: the strength
 * suites call `createGameState(configs, rng)` with no options and rely on seat 0
 * leading, and the rematch rotation policy belongs to the screen, not to a pure
 * engine.
 */

const TWO = [
  { id: 'p0', name: 'P0', isAI: false },
  { id: 'p1', name: 'P1', isAI: true },
];

const FOUR = [
  { id: 'p0', name: 'P0', isAI: false, team: 1 },
  { id: 'p1', name: 'P1', isAI: true, team: 2 },
  { id: 'p2', name: 'P2', isAI: true, team: 1 },
  { id: 'p3', name: 'P3', isAI: true, team: 2 },
];

describe('createGameState starting player', () => {
  it('leads from seat 0 when no starting index is given', () => {
    const state = createGameState(TWO);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.leadPlayerIndex).toBe(0);
  });

  it('leads from the requested seat', () => {
    const state = createGameState(FOUR, undefined, { startingPlayerIndex: 2 });
    expect(state.currentPlayerIndex).toBe(2);
    expect(state.leadPlayerIndex).toBe(2);
  });

  it('wraps a starting index past the last seat', () => {
    const state = createGameState(FOUR, undefined, { startingPlayerIndex: 5 });
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.leadPlayerIndex).toBe(1);
  });

  it('wraps a negative starting index', () => {
    const state = createGameState(FOUR, undefined, { startingPlayerIndex: -1 });
    expect(state.currentPlayerIndex).toBe(3);
    expect(state.leadPlayerIndex).toBe(3);
  });

  /**
   * The guard for tests/unit/ai-ladder.test.ts and ai-tournament.test.ts. Both
   * seed the deal and threshold win rates against it. If choosing a starting
   * seat drew from `rng`, every seeded deal downstream would shift and those
   * suites would fail for a reason that has nothing to do with the AI.
   */
  it('deals identical cards whether or not a starting index is given', () => {
    const plain = createGameState(FOUR, mulberry32(20260816));
    const shifted = createGameState(FOUR, mulberry32(20260816), { startingPlayerIndex: 3 });

    expect(shifted.trumpCard).toEqual(plain.trumpCard);
    expect(shifted.deck).toEqual(plain.deck);
    for (let i = 0; i < plain.players.length; i++) {
      expect(shifted.players[i].hand).toEqual(plain.players[i].hand);
    }
  });
});

describe('nextStarter', () => {
  it('draws a seat in range on the first game', () => {
    const rng = mulberry32(20260816);
    for (let i = 0; i < 50; i++) {
      const seat = nextStarter(null, 4, rng);
      expect(seat).toBeGreaterThanOrEqual(0);
      expect(seat).toBeLessThan(4);
    }
  });

  it('uses the whole range over many first games', () => {
    const rng = mulberry32(20260816);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(nextStarter(null, 4, rng));
    expect(seen).toEqual(new Set([0, 1, 2, 3]));
  });

  it('passes the lead to the next seat on a rematch', () => {
    expect(nextStarter(0, 2)).toBe(1);
    expect(nextStarter(1, 4)).toBe(2);
  });

  it('wraps back to the first seat after the last one', () => {
    expect(nextStarter(1, 2)).toBe(0);
    expect(nextStarter(3, 4)).toBe(0);
  });
});
