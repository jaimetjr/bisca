import { describe, it, expect, beforeAll } from 'vitest';
import { chooseAICard } from '../../shared/lib/brisca/ai';
import {
  createGameState,
  playCard,
  completeTrick,
  getCardPoints,
} from '../../shared/lib/brisca/engine';
import { OPPONENTS, OpponentTrait } from '../../shared/lib/brisca/opponents';
import { NEUTRAL_WEIGHTS, EvalWeights } from '../../shared/constants/game';
import { mulberry32 } from '../../shared/lib/rng';
import type { Card, GameState } from '../../shared/lib/types';

/**
 * Personas must change *what a bot wants*, never *how good it is*.
 *
 * Two failure modes, one test each:
 *
 *  - A weight that quietly makes a persona stronger or weaker has reinvented
 *    difficulty under a style label. `strength band` duels every persona
 *    against the neutral baseline and fails if the result drifts off even.
 *  - A weight that changes nothing leaves a persona that is a rename wearing a
 *    style label — and the strength band would happily pass. `behaviour` asserts
 *    the opposing pairs actually play differently, on a metric that names the
 *    style: contesting cheap tricks, and spending trumps early.
 *
 * Everything is seeded and driven by a frozen clock, so results are identical
 * on every machine. `epsilon: 0` matters more here than anywhere else: the
 * deliberate-mistake dial is noise for this measurement, and the weights are
 * the only thing left moving.
 */

const BUDGET = { simulations: 4, maxTrickDepth: 2, epsilon: 0 };
const FROZEN_CLOCK = { nowMs: () => 0, timeBudgetMs: 1 };

type Probe = (seat: number, state: GameState, card: Card) => void;

function policy(weights: EvalWeights, rng: () => number) {
  return (state: GameState, playerId: string) =>
    chooseAICard(state, playerId, 'hard', { ...BUDGET, ...FROZEN_CLOCK, rng, weights });
}

/** One full game between two weight sets. Returns each seat's final score. */
function playGame(
  seat0: EvalWeights,
  seat1: EvalWeights,
  rng: () => number,
  probe?: Probe,
): [number, number] {
  const policies = [policy(seat0, rng), policy(seat1, rng)];
  let state = createGameState(
    [
      { id: 'p0', name: 'P0', isAI: true },
      { id: 'p1', name: 'P1', isAI: true },
    ],
    rng,
  );

  let guard = 0;
  while (state.phase !== 'gameOver' && guard++ < 300) {
    while (state.phase === 'trickComplete') state = completeTrick(state);
    if (state.phase !== 'playing') break;

    const seat = state.currentPlayerIndex;
    const player = state.players[seat];
    const card = policies[seat](state, player.id);
    if (!card) throw new Error(`no card for ${player.id}`);

    probe?.(seat, state, card);
    state = playCard(state, player.id, card);
  }
  while (state.phase === 'trickComplete') state = completeTrick(state);

  return [state.players[0].score, state.players[1].score];
}

interface Duel {
  winRate: number;
  meanDiff: number;
  summary: string;
}

/** `subject` against `baseline`, seats alternating so the lead cancels out. */
function duel(label: string, subject: EvalWeights, baseline: EvalWeights, games: number): Duel {
  const rng = mulberry32(20260816);
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let diff = 0;

  for (let g = 0; g < games; g++) {
    const subjectFirst = g % 2 === 0;
    const [s0, s1] = subjectFirst
      ? playGame(subject, baseline, rng)
      : playGame(baseline, subject, rng);
    const mine = subjectFirst ? s0 : s1;
    const theirs = subjectFirst ? s1 : s0;

    diff += mine - theirs;
    if (mine > theirs) wins++;
    else if (theirs > mine) losses++;
    else draws++;
  }

  const winRate = (wins + draws / 2) / games;
  return {
    winRate,
    meanDiff: diff / games,
    summary:
      `${label} vs neutral: ${wins}W/${losses}L/${draws}D over ${games} games, ` +
      `winRate ${winRate.toFixed(3)}, meanPointDiff ${(diff / games).toFixed(2)}`,
  };
}

// ─── Strength: a persona is a style, not a difficulty ────────────────────────

describe('persona strength band', () => {
  // Deterministic, so a fixed count is a fixed outcome rather than a sample.
  const GAMES = 24;
  const duels = new Map<string, Duel>();

  beforeAll(() => {
    for (const o of OPPONENTS) {
      duels.set(o.id, duel(o.id, o.weights, NEUTRAL_WEIGHTS, GAMES));
    }
  }, 300_000);

  for (const o of OPPONENTS) {
    it(`${o.id} (${o.trait}) plays neither better nor worse than neutral`, () => {
      const d = duels.get(o.id)!;
      expect(d.winRate, d.summary).toBeGreaterThan(0.35);
      expect(d.winRate, d.summary).toBeLessThan(0.65);
    });
  }
});

// ─── Behaviour: the weights actually move the play ───────────────────────────

/**
 * Runs `games` games of the subject against neutral, alternating seats, and
 * totals whatever `count` returns for each card the subject plays in the first
 * `openingTricks` tricks. The opening is where a style shows: by the endgame
 * both bots are down to forced cards.
 */
function overOpeningPlays(
  weights: EvalWeights,
  seed: number,
  games: number,
  count: (card: Card, state: GameState) => number,
  openingTricks = 4,
): number {
  const rng = mulberry32(seed);
  let total = 0;

  for (let g = 0; g < games; g++) {
    const seat = g % 2;
    let tricksSeen = 0;
    let lastTrickLength = 0;

    const probe: Probe = (playedSeat, state, card) => {
      // currentTrick resets to empty each time a trick completes.
      if (state.currentTrick.length < lastTrickLength) tricksSeen++;
      lastTrickLength = state.currentTrick.length;

      if (playedSeat !== seat || tricksSeen >= openingTricks) return;
      total += count(card, state);
    };

    if (seat === 0) playGame(weights, NEUTRAL_WEIGHTS, rng, probe);
    else playGame(NEUTRAL_WEIGHTS, weights, rng, probe);
  }

  return total;
}

const isTrump = (card: Card, state: GameState) =>
  state.trumpSuit && card.suit === state.trumpSuit ? 1 : 0;

const pointValue = (card: Card) => getCardPoints(card);

const byTrait = (trait: OpponentTrait) => OPPONENTS.find(o => o.trait === trait)!.weights;

const earlyTrumps = (w: EvalWeights, games: number) =>
  overOpeningPlays(w, 20260818, games, isTrump);

const earlyPoints = (w: EvalWeights, games: number) =>
  overOpeningPlays(w, 20260817, games, pointValue);

describe('persona behaviour', () => {
  const GAMES = 24;

  /** trumpControlBonus prices a live trump. Low price → spend it. */
  it('the trump spender plays more early trumps than the hoarder', () => {
    const spender = earlyTrumps(byTrait('trumpSpender'), GAMES);
    const hoarder = earlyTrumps(byTrait('trumpHoarder'), GAMES);
    expect(
      spender,
      `spender played ${spender} early trumps, hoarder ${hoarder}`,
    ).toBeGreaterThan(hoarder);
  }, 300_000);

  /**
   * handPotentialWeight prices cards still in hand. High → hold the good ones
   * back, so fewer points go out early; low → cash them in.
   */
  it('the speculator commits fewer points early than the materialist', () => {
    const speculator = earlyPoints(byTrait('speculator'), GAMES);
    const materialist = earlyPoints(byTrait('materialist'), GAMES);
    expect(
      speculator,
      `speculator committed ${speculator} early points, materialist ${materialist}`,
    ).toBeLessThan(materialist);
  }, 300_000);

  /** Both dials at once, opposite ways: the loose one burns trumps early. */
  it('the gambler plays more early trumps than the accumulator', () => {
    const gambler = earlyTrumps(byTrait('gambler'), GAMES);
    const accumulator = earlyTrumps(byTrait('accumulator'), GAMES);
    expect(
      gambler,
      `gambler played ${gambler} early trumps, accumulator ${accumulator}`,
    ).toBeGreaterThan(accumulator);
  }, 300_000);
});
