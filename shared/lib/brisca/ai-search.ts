import { Card, GameState, Player, AIDifficulty } from '../types';
import { AI_SEARCH_CONFIG, AI_HAND_POTENTIAL_WEIGHT } from '../../constants/game';
import { legalCards } from './engine';
import { chooseHeuristicCard } from './ai-heuristic';
import { sampleDeal } from './ai-determinize';
import {
  SimState,
  toSimState,
  simApply,
  simLegalCards,
  simAliveCards,
  simSides,
  simOtherSide,
  simSideScore,
  trickWinner,
  cardPoints,
  cardStrength,
} from './ai-sim';

/**
 * Perfect Information Monte Carlo search for Brisca.
 *
 * Per move: sample N plausible deals of the unseen cards (determinization),
 * solve each one with depth- and time-budgeted alpha-beta minimax, then play
 * the card with the best average value across the samples.
 *
 * Minimax is sound here because the AI only ever plays offline games, which
 * are 1v1 or fixed-partnership 2v2 — always two sides splitting a fixed
 * 120-point pot, so a single scalar (my side's points minus theirs) is a
 * proper zero-sum value. A free-for-all with 3+ independent players would
 * need maxⁿ instead; offline cannot produce one.
 *
 * KNOWN SIMPLIFICATION — perfect partner assumption (2v2 only):
 * inside each determinization the search is double-dummy, so it assumes every
 * player, including the AI's own partner, plays the line it computes as
 * optimal. This is the standard strategy-fusion weakness that double-dummy
 * Bridge solvers also accept, and it bites both 2v2 pairings: `ai-2` is
 * partnered with the *human*, who may simply not find the correct response,
 * while `ai-1`/`ai-3` are partnered with each other but each run their own
 * independent determinizations and so will not reproduce the other's assumed
 * line either. Consequence: the AI can occasionally pick a play that is only
 * correct if the partner cooperates perfectly. Modelling an uncertain partner
 * policy is deliberately out of scope — documented so it is not later
 * rediscovered as a mystery bug.
 *
 * The search runs on the lightweight SimState from ./ai-sim.ts rather than the
 * engine's GameState; see that file for why.
 */

// A trump that is still master is worth roughly a King in future capture.
const TRUMP_CONTROL_BONUS = 4;
// Points in a trick worth spending a winner on — mirrors the legacy heuristic.
const CONTESTED_TRICK_POINTS = 6;

/** Filled in by the search when supplied. Benchmark instrumentation only. */
export interface SearchStats {
  nodes: number;
  depthReached: number;
  elapsedMs: number;
}

export interface SearchOptions {
  strictFollowSuit?: boolean;
  rng?: () => number;
  epsilon?: number;
  nowMs?: () => number;
  simulations?: number;
  maxTrickDepth?: number;
  timeBudgetMs?: number;
  stats?: SearchStats;
}

// ─── Sides ───────────────────────────────────────────────────────────────────

/**
 * Which side a player is on. In 2v2 that is their team; in 1v1 `team` is
 * undefined and each player is their own side, which makes the same zero-sum
 * machinery work for both modes.
 */
export function sideOf(player: Player, players: Player[]): number {
  return player.team ?? players.indexOf(player);
}

/** The two opposing side ids in this position, in stable order. */
export function sidesOf(state: GameState): number[] {
  return simSides(toSimState(state));
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

/**
 * Speculative worth of the cards a side still holds.
 *
 * For each card, how likely it is to survive is approximated by how many of
 * the still-alive cards in its own suit outrank it. This generalises the old
 * heuristic's Ace/Tres tracking to every rank in every suit. Trumps get an
 * extra control bonus because their value is mostly in capturing *other*
 * people's points, not in their own face value.
 */
function handPotential(state: SimState, side: number, alive: Card[]): number {
  let total = 0;

  for (let i = 0; i < state.hands.length; i++) {
    if (state.sides[i] !== side) continue;

    for (const card of state.hands[i]) {
      let peers = 0;
      let higher = 0;
      for (const other of alive) {
        if (other.suit !== card.suit || other.id === card.id) continue;
        peers++;
        if (cardStrength(other) > cardStrength(card)) higher++;
      }
      const survival = peers === 0 ? 1 : 1 - higher / peers;

      total += cardPoints(card) * survival;
      if (state.trumpSuit && card.suit === state.trumpSuit) {
        total += TRUMP_CONTROL_BONUS * survival;
      }
    }
  }

  return total;
}

function evaluateSim(state: SimState, side: number): number {
  const opp = simOtherSide(state, side);
  let value = simSideScore(state, side) - simSideScore(state, opp);

  // Credit the in-progress trick to whoever is currently winning it, scaled by
  // how much of the trick has been played — an early lead is weak evidence.
  if (state.trick.length > 0) {
    const leader = trickWinner(state.trick, state.trumpSuit);
    let points = 0;
    for (const entry of state.trick) points += cardPoints(entry.card);
    const confidence = state.trick.length / state.hands.length;
    value += (state.sides[leader] === side ? 1 : -1) * points * confidence;
  }

  const alive = simAliveCards(state);
  value += AI_HAND_POTENTIAL_WEIGHT * (
    handPotential(state, side, alive) - handPotential(state, opp, alive)
  );

  return value;
}

/**
 * Value of a non-terminal position from `side`'s point of view.
 *
 * Must satisfy `evaluate(state, a) === -evaluate(state, b)` for the two
 * opposing sides — an asymmetric evaluation silently biases the whole search.
 * tests/unit/ai-search.test.ts asserts this directly.
 */
export function evaluate(state: GameState, side: number): number {
  return evaluateSim(toSimState(state), side);
}

/**
 * Exact value of a finished game. The pot is always 120 points split between
 * two sides, so a positive difference *is* a win — no separate win bonus is
 * needed to keep the search aligned with actually winning.
 */
function terminalValue(state: SimState, side: number): number {
  return simSideScore(state, side) - simSideScore(state, simOtherSide(state, side));
}

// ─── Search ──────────────────────────────────────────────────────────────────

interface SearchCtx {
  rootSide: number;
  strictFollowSuit: boolean;
  deadline: number;
  now: () => number;
  nodes: number;
  aborted: boolean;
}

/**
 * Candidate moves, ordered so alpha-beta cuts early: try to win a trick that
 * is actually worth something with the cheapest winner, otherwise throw the
 * cheapest card. Same instinct as the legacy heuristic, expressed directly on
 * SimState — ordering only affects speed, never the value returned.
 */
function orderedMoves(state: SimState, ctx: SearchCtx): Card[] {
  const cards = simLegalCards(state, ctx.strictFollowSuit);
  if (cards.length <= 1) return cards;

  let trickPoints = 0;
  for (const entry of state.trick) trickPoints += cardPoints(entry.card);
  const contested = trickPoints >= CONTESTED_TRICK_POINTS;

  const scored = cards.map(card => {
    const wins =
      state.trick.length === 0 ||
      trickWinner(state.trick.concat({ player: state.current, card }), state.trumpSuit) ===
        state.current;
    // Lower key is tried first.
    const key = (contested && wins ? -1000 : 0) + cardPoints(card) * 10 + cardStrength(card);
    return { card, key };
  });

  scored.sort((a, b) => a.key - b.key);
  return scored.map(s => s.card);
}

function searchValue(
  state: SimState,
  ctx: SearchCtx,
  plyBudget: number,
  alpha: number,
  beta: number,
): number {
  if (state.done) return terminalValue(state, ctx.rootSide);

  ctx.nodes++;
  if (plyBudget <= 0) return evaluateSim(state, ctx.rootSide);
  if (ctx.now() > ctx.deadline) {
    ctx.aborted = true;
    return evaluateSim(state, ctx.rootSide);
  }

  const moves = orderedMoves(state, ctx);
  if (moves.length === 0) return evaluateSim(state, ctx.rootSide);

  const maximizing = state.sides[state.current] === ctx.rootSide;
  let best = maximizing ? -Infinity : Infinity;
  let a = alpha;
  let b = beta;

  for (const card of moves) {
    const value = searchValue(simApply(state, card), ctx, plyBudget - 1, a, b);

    if (maximizing) {
      if (value > best) best = value;
      if (best > a) a = best;
    } else {
      if (value < best) best = value;
      if (best < b) b = best;
    }

    if (b <= a) break;
    if (ctx.aborted) break;
  }

  return best;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export function chooseSearchCard(
  state: GameState,
  playerId: string,
  difficulty: AIDifficulty = 'medium',
  options: SearchOptions = {},
): Card | null {
  const me = state.players.find(p => p.id === playerId);
  if (!me || me.hand.length === 0) return null;

  const strictFollowSuit = options.strictFollowSuit === true;
  const rng = options.rng ?? Math.random;
  const now = options.nowMs ?? (() => Date.now());

  const candidates = strictFollowSuit ? legalCards(state, playerId) : [...me.hand];
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const preset = AI_SEARCH_CONFIG[difficulty];
  const simulations = options.simulations ?? preset.simulations;
  const maxTrickDepth = options.maxTrickDepth ?? preset.maxTrickDepth;
  const timeBudgetMs = options.timeBudgetMs ?? preset.timeBudgetMs;
  const epsilon = options.epsilon ?? preset.epsilon;

  const rootSide = sideOf(me, state.players);
  const deadline = now() + timeBudgetMs;

  // Sample the worlds once and reuse them at every depth, so deepening
  // compares like with like instead of re-rolling the deal each pass.
  const worlds: SimState[] = [];
  for (let i = 0; i < simulations; i++) {
    worlds.push(toSimState(sampleDeal(state, playerId, rng)));
  }

  // `deadline` is set per-depth inside the loop (Infinity on the first pass);
  // this is just the initial value.
  const ctx: SearchCtx = { rootSide, strictFollowSuit, deadline, now, nodes: 0, aborted: false };
  let ranking: { card: Card; value: number }[] | null = null;
  let depthReached = 0;
  const startedAt = now();

  for (let depth = 1; depth <= maxTrickDepth; depth++) {
    // The first pass ignores the deadline so it always runs to completion. That
    // guarantees a real ranking exists no matter how slow the host is, so the
    // search can never silently collapse to the plain heuristic — the depth-1
    // sweep is cheap and bounded (~2k nodes worst case even in 2v2). Deeper
    // passes honour the real budget and abort when it is spent.
    ctx.deadline = depth === 1 ? Infinity : deadline;
    const totals = new Map<string, number>();
    ctx.aborted = false;
    let completed = true;

    for (const world of worlds) {
      for (const card of candidates) {
        // Full window per candidate on purpose: narrowing it would return
        // bounds rather than true values for the losing moves, which would
        // corrupt the averaging across worlds.
        const value = searchValue(
          simApply(world, card),
          ctx,
          depth * state.players.length - 1,
          -Infinity,
          Infinity,
        );
        totals.set(card.id, (totals.get(card.id) ?? 0) + value);
      }
      if (ctx.aborted) { completed = false; break; }
    }

    // Only accept a depth whose full sweep finished — a partial sweep has
    // seen different worlds for different candidates and is not comparable.
    if (!completed) break;

    ranking = candidates
      .map(card => ({ card, value: (totals.get(card.id) ?? 0) / worlds.length }))
      .sort((x, y) => y.value - x.value);
    depthReached = depth;

    if (ctx.now() > deadline) break;
  }

  if (options.stats) {
    options.stats.nodes = ctx.nodes;
    options.stats.depthReached = depthReached;
    options.stats.elapsedMs = now() - startedAt;
  }

  if (!ranking || ranking.length === 0) {
    // Unreachable in normal play: depth 1 ignores the deadline and always
    // completes, so `ranking` is set whenever there is >1 candidate. Kept as a
    // defensive last resort only.
    return chooseHeuristicCard(state, playerId, difficulty, { strictFollowSuit, rng }) ?? candidates[0];
  }

  if (epsilon > 0 && ranking.length > 1 && rng() < epsilon) {
    const suboptimal = ranking.slice(1);
    return suboptimal[Math.floor(rng() * suboptimal.length)].card;
  }

  return ranking[0].card;
}
