import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CARD_BACK_IDS,
  DEFAULT_CARD_BACK,
  toCardBackId,
} from '../../shared/lib/brisca/card-backs';

/**
 * The card back catalog is spread across three places that cannot import each
 * other: the id list (shared/, server-safe), the `require()` map
 * (components/CardSprite.tsx, Metro-only) and the artwork generator
 * (assets/brand/card-backs.js, Node-only). Nothing but this test notices when
 * they drift — a missing entry would only surface as a blank card at runtime.
 */
const ROOT = path.resolve(__dirname, '../..');
const ART = path.join(ROOT, 'assets/images/spanish');

const readFile = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('catálogo de versos', () => {
  it('todo id tem uma imagem no mapa do CardSprite, e o mapa não tem ids extras', () => {
    const src = readFile('components/CardSprite.tsx');
    const block = src.slice(src.indexOf('CARD_BACK_IMAGES'));
    const mapped = [...block.matchAll(/reverso-(\w+)\.webp/g)].map((m) => m[1]);
    expect(mapped.sort()).toEqual([...CARD_BACK_IDS].sort());
  });

  it('o gerador de arte produz exatamente os mesmos ids', () => {
    const { cardBacks } = require('../../assets/brand/card-backs.js');
    expect(cardBacks.map((b: { id: string }) => b.id).sort()).toEqual([...CARD_BACK_IDS].sort());
  });

  it('cada verso existe em disco', () => {
    // `.webp`, not `.png`: gen-assets.js still renders the backs as PNG, and
    // scripts/webp-cards.mjs re-encodes the directory afterwards. Whoever
    // regenerates a back has to run both, and this is what says so.
    for (const id of CARD_BACK_IDS) {
      expect(fs.existsSync(path.join(ART, `reverso-${id}.webp`)), id).toBe(true);
    }
  });

  it('o verso padrão é um id válido', () => {
    expect(CARD_BACK_IDS).toContain(DEFAULT_CARD_BACK);
  });

  it('toCardBackId aceita ids válidos e rejeita o resto', () => {
    for (const id of CARD_BACK_IDS) expect(toCardBackId(id)).toBe(id);
    // A back removed in a later version, or a hand-edited settings file, must
    // fall back rather than reach the image map with a key that isn't there.
    for (const bad of ['dourado', '', null, undefined, 42, {}]) {
      expect(toCardBackId(bad)).toBe(DEFAULT_CARD_BACK);
    }
  });
});
