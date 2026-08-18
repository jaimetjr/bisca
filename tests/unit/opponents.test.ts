import { describe, it, expect } from 'vitest';
import {
  OPPONENTS,
  OPPONENT_TRAITS,
  pickOpponents,
  toPersona,
} from '../../shared/lib/brisca/opponents';
import { NEUTRAL_WEIGHTS } from '../../shared/constants/game';
import { mulberry32 } from '../../shared/lib/rng';

/**
 * The opponent roster is pure data, like the card-back catalog. These tests
 * guard the properties the game relies on: a bot can always be resolved back
 * from the id stored on its Player, and a table never seats the same persona
 * twice.
 *
 * `trait` is deliberately not user-facing text — it names the style for the
 * catalog and for tests/unit/ai-persona.test.ts, and carries no translation.
 * The scoreboard showed it briefly and it read as jargon: a label like
 * "Arriscado" says nothing about what the bot actually did. What distinguishes
 * an opponent in play is the name, the icon, the colour, and the way it plays.
 */

describe('OPPONENTS catalog', () => {
  it('has at least one persona per seat a 2v2 table needs', () => {
    expect(OPPONENTS.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every persona a unique id', () => {
    const ids = OPPONENTS.map(o => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every persona a unique name', () => {
    const names = OPPONENTS.map(o => o.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every persona an icon and a colour', () => {
    for (const o of OPPONENTS) {
      expect(o.icon, o.id).toBeTruthy();
      expect(o.color, o.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('declares only known traits', () => {
    for (const o of OPPONENTS) {
      expect(OPPONENT_TRAITS, o.id).toContain(o.trait);
    }
  });

  /**
   * A persona whose weights equal the baseline is indistinguishable from the
   * neutral bot — it would be a name change wearing a style label.
   */
  it('moves at least one weight away from neutral for every persona', () => {
    for (const o of OPPONENTS) {
      expect(o.weights, o.id).not.toEqual(NEUTRAL_WEIGHTS);
    }
  });

  it('covers every trait it declares', () => {
    const used = new Set(OPPONENTS.map(o => o.trait));
    expect(used).toEqual(new Set(OPPONENT_TRAITS));
  });
});

describe('pickOpponents', () => {
  it('returns the number of personas asked for', () => {
    expect(pickOpponents(1, mulberry32(1))).toHaveLength(1);
    expect(pickOpponents(3, mulberry32(1))).toHaveLength(3);
  });

  it('never seats the same persona twice at one table', () => {
    for (let seed = 0; seed < 60; seed++) {
      const picks = pickOpponents(3, mulberry32(seed));
      expect(new Set(picks.map(p => p.id)).size).toBe(3);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = pickOpponents(3, mulberry32(20260816));
    const b = pickOpponents(3, mulberry32(20260816));
    expect(a.map(p => p.id)).toEqual(b.map(p => p.id));
  });

  it('varies across seeds rather than always returning the same table', () => {
    const tables = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      tables.add(pickOpponents(3, mulberry32(seed)).map(p => p.id).join(','));
    }
    expect(tables.size).toBeGreaterThan(1);
  });
});

describe('toPersona', () => {
  it('resolves a persona from its id', () => {
    const first = OPPONENTS[0];
    expect(toPersona(first.id)).toEqual(first);
  });

  /** Online players and older saved games carry no persona id. */
  it('returns null for anything it does not recognise', () => {
    expect(toPersona('no-such-persona')).toBeNull();
    expect(toPersona(undefined)).toBeNull();
    expect(toPersona(null)).toBeNull();
    expect(toPersona(42)).toBeNull();
  });
});
