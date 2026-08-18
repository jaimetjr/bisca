/**
 * Opponent roster. PURE DATA — no image `require()`, so this stays safe to
 * import from the server bundle, exactly like ./card-backs.ts.
 *
 * Two independent axes decide how a bot plays:
 *
 *   difficulty (AI_SEARCH_CONFIG) → how *well* it computes — search depth,
 *                                   sample count, how often it errs on purpose
 *   persona    (EvalWeights)      → what it *wants* — which positions it likes
 *
 * A persona therefore never makes an opponent stronger or weaker, only
 * different. tests/unit/ai-persona.test.ts holds that line by duelling every
 * persona against the neutral baseline and failing if the win rate drifts out
 * of a narrow band around even.
 *
 * Names are deliberately NOT translated — a person's name is the same in every
 * language. Only the trait label is, via `opponent.trait.${trait}`, so adding
 * personas costs nothing in translation work.
 */

import { EvalWeights, NEUTRAL_WEIGHTS } from '../../constants/game';
import { shuffleWith } from '../rng';

/**
 * Six styles built from the two dials that provably move play: how a bot prices
 * a live trump, and how much it trusts what its hand may still win. Four
 * personas push one dial each; the last two push both at once, in opposite
 * combinations, which reads as a different player again rather than as a
 * stronger or weaker one.
 */
export type OpponentTrait =
  | 'trumpHoarder'
  | 'trumpSpender'
  | 'speculator'
  | 'materialist'
  | 'accumulator'
  | 'gambler';

/** Every trait the catalog may use. Also the i18n key set. */
export const OPPONENT_TRAITS: readonly OpponentTrait[] = [
  'trumpHoarder',
  'trumpSpender',
  'speculator',
  'materialist',
  'accumulator',
  'gambler',
];

export interface OpponentPersona {
  id: string;
  /** Shown as-is in every language. */
  name: string;
  trait: OpponentTrait;
  /** MaterialCommunityIcons glyph name. */
  icon: string;
  color: string;
  weights: EvalWeights;
}

/**
 * Six opponents, one per trait, each moving a single dial away from
 * NEUTRAL_WEIGHTS so the cause of a behaviour is always legible. The numbers
 * are tuned against the strength band in tests/unit/ai-persona.test.ts — a
 * persona that drifts out of that band needs its weight recalibrated, not the
 * test relaxed.
 */
export const OPPONENTS: readonly OpponentPersona[] = [
  {
    id: 'pedro',
    name: 'Pedro',
    trait: 'trumpHoarder',
    icon: 'treasure-chest',
    color: '#D4A843',
    // Prices a live trump well above its face value, so he sits on them.
    weights: { ...NEUTRAL_WEIGHTS, trumpControlBonus: 8 },
  },
  {
    id: 'nuno',
    name: 'Nuno',
    trait: 'trumpSpender',
    icon: 'sword-cross',
    color: '#8B1A1A',
    // Barely credits keeping a trump, so he cuts early and often.
    weights: { ...NEUTRAL_WEIGHTS, trumpControlBonus: 1.5 },
  },
  {
    id: 'maria',
    name: 'Maria',
    trait: 'speculator',
    icon: 'chess-queen',
    color: '#7B4FA8',
    // Trusts what her hand may still win, so she holds her good cards back.
    weights: { ...NEUTRAL_WEIGHTS, handPotentialWeight: 0.9 },
  },
  {
    id: 'beatriz',
    name: 'Beatriz',
    trait: 'materialist',
    icon: 'sack',
    color: '#2E7D32',
    // Counts captured points and little else, so she cashes in early.
    weights: { ...NEUTRAL_WEIGHTS, handPotentialWeight: 0.15 },
  },
  // The two below move both dials at once. The dials interact — because
  // handPotentialWeight scales the whole hand term, trump bonus included, it
  // acts as a general hold-vs-spend dial and outweighs trumpControlBonus, which
  // only sets what trumps are worth *relative to* the rest of the hand. So the
  // coherent combinations are the reinforcing ones: hold everything and prize
  // trumps, or spend everything and prize nothing. Opposing the two dials
  // mostly cancels out, which is measurable and was tried first.
  {
    id: 'carlos',
    name: 'Carlos',
    trait: 'accumulator',
    icon: 'safe-square',
    color: '#1565C0',
    weights: { trumpControlBonus: 8, handPotentialWeight: 0.9 },
  },
  {
    id: 'rosa',
    name: 'Rosa',
    trait: 'gambler',
    icon: 'fire',
    color: '#C62828',
    weights: { trumpControlBonus: 1.5, handPotentialWeight: 0.15 },
  },
];

/**
 * Narrows an id that arrived from game state. Online players and games created
 * before personas existed carry none, so the miss case is normal, not an error.
 */
export function toPersona(id: unknown): OpponentPersona | null {
  return OPPONENTS.find(o => o.id === id) ?? null;
}

/**
 * Personas for one table, never repeating a seat. `rng` is injectable so tests
 * are deterministic; production omits it and gets `Math.random`, the same
 * arrangement `createGameState` uses.
 */
export function pickOpponents(count: number, rng: () => number = Math.random): OpponentPersona[] {
  return shuffleWith([...OPPONENTS], rng).slice(0, count);
}
