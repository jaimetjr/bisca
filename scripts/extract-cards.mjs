/**
 * Extracts the 40 Brisca card faces from the purchased Illustrator sheets.
 *
 * Sources live in assets/source/ — one .ai per suit, each a 5x2 grid holding
 * ranks 1-7, 10, 11, 12 (Spanish decks skip 8 and 9, so the sheets are already
 * exactly the Brisca deck). The .ai files are PDF-1.5 containers, so pdftocairo
 * rasterises them directly.
 *
 * Cards are located by scanning for fully-transparent rows/columns rather than
 * assuming a uniform grid — the two rows are not pixel-aligned in the artwork.
 * `-transp` leaves the area outside each card transparent (including outside the
 * rounded corners) while the card face stays opaque, which is exactly what we
 * need over the green felt table.
 *
 * Output is PNG, which is *not* what the app imports: run
 * `node scripts/webp-cards.mjs` afterwards to re-encode the directory to WebP.
 * The faces are 620x1016 RGBA, and at that size PNG cost 169KB a card — enough
 * that the deck no longer fit in the decoded-bitmap cache and cards were being
 * re-decoded as they were dealt.
 *
 * The extraction is faithful to the sheets, and the sheets have one gap: the Rey
 * de Copas is drawn with no cup anywhere on it, alone in the deck in not showing
 * its suit. `fix-rey-copas.mjs` puts one there afterwards, so it is part of the
 * pipeline rather than a manual touch-up — skip it and the deck ships with a
 * card whose suit cannot be read.
 *
 * Usage:
 *   node scripts/extract-cards.mjs  *     && node scripts/webp-cards.mjs  *     && node scripts/fix-rey-copas.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/source');
const OUT = path.join(ROOT, 'assets/images/spanish');

/** Sheet filename -> the suit name the app uses in its require map. */
const SUITS = { gold: 'oros', cups: 'copas', spades: 'espadas', sticks: 'bastos' };

/** Grid position -> rank. Row 0 is 1-5, row 1 is 6, 7 and the three faces. */
const RANKS = [[1, 2, 3, 4, 5], [6, 7, 10, 11, 12]];

/** Chosen so a single card lands at ~620px wide; see calibrate(). */
const TARGET_CARD_WIDTH = 620;

const isBlank = (data, i) => data[i + 3] < 16;

/** Index ranges along an axis that contain at least one non-transparent pixel. */
function contentRuns(png, axis, band) {
  const { width, height, data } = png;
  const [outerLen, innerLen] = axis === 'x' ? [width, height] : [height, width];
  const [lo, hi] = band ?? [0, innerLen - 1];
  const runs = [];
  let start = null;
  for (let o = 0; o < outerLen; o++) {
    let blank = true;
    for (let i = lo; i <= hi; i++) {
      const idx = (axis === 'x' ? i * width + o : o * width + i) * 4;
      if (!isBlank(data, idx)) { blank = false; break; }
    }
    if (!blank && start === null) start = o;
    else if (blank && start !== null) { runs.push([start, o - 1]); start = null; }
  }
  if (start !== null) runs.push([start, outerLen - 1]);
  return runs;
}

function render(aiPath, dpi, dir, stem) {
  execFileSync('pdftocairo', ['-png', '-r', String(dpi), '-transp', aiPath, path.join(dir, stem)]);
  return PNG.sync.read(fs.readFileSync(path.join(dir, `${stem}-1.png`)));
}

/** Locate the 10 card boxes on a rasterised sheet, in reading order. */
function locateCards(png) {
  const rows = contentRuns(png, 'y');
  if (rows.length !== 2) throw new Error(`esperava 2 fileiras de cartas, achei ${rows.length}`);
  const boxes = [];
  for (const [top, bottom] of rows) {
    // Re-scan columns within this row band so a misaligned row cannot merge cards.
    const cols = contentRuns(png, 'x', [top, bottom]);
    if (cols.length !== 5) throw new Error(`esperava 5 cartas na fileira, achei ${cols.length}`);
    for (const [left, right] of cols) boxes.push({ left, top, right, bottom });
  }
  return boxes;
}

/** Copy a box out of the sheet, centred in a transparent w x h canvas. */
function crop(sheet, box, w, h) {
  const out = new PNG({ width: w, height: h });
  out.data.fill(0);
  const bw = box.right - box.left + 1;
  const bh = box.bottom - box.top + 1;
  const dx = Math.floor((w - bw) / 2);
  const dy = Math.floor((h - bh) / 2);
  for (let y = 0; y < bh; y++) {
    const src = ((box.top + y) * sheet.width + box.left) * 4;
    const dst = ((dy + y) * w + dx) * 4;
    sheet.data.copy(out.data, dst, src, src + bw * 4);
  }
  return out;
}

/** Render one sheet cheaply to find the dpi that yields TARGET_CARD_WIDTH. */
function calibrate(dir) {
  const probeDpi = 20;
  const png = render(path.join(SRC, 'gold.ai'), probeDpi, dir, 'probe');
  const { left, right } = locateCards(png)[0];
  const dpi = Math.round((probeDpi * TARGET_CARD_WIDTH) / (right - left + 1));
  console.log(`calibragem: carta = ${right - left + 1}px a ${probeDpi}dpi -> usando ${dpi}dpi`);
  return dpi;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brisca-cards-'));
try {
  const dpi = calibrate(tmp);

  // Pass 1: rasterise every sheet and collect card boxes, so the output canvas
  // can be sized once from the largest card across all four suits.
  const sheets = Object.entries(SUITS).map(([stem, suit]) => {
    const png = render(path.join(SRC, `${stem}.ai`), dpi, tmp, stem);
    return { suit, png, boxes: locateCards(png) };
  });

  const all = sheets.flatMap((s) => s.boxes);
  const width = Math.max(...all.map((b) => b.right - b.left + 1));
  const height = Math.max(...all.map((b) => b.bottom - b.top + 1));

  fs.mkdirSync(OUT, { recursive: true });
  for (const { suit, png, boxes } of sheets) {
    boxes.forEach((box, i) => {
      const rank = RANKS[Math.floor(i / 5)][i % 5];
      const name = `${String(rank).padStart(2, '0')}-${suit}.png`;
      fs.writeFileSync(path.join(OUT, name), PNG.sync.write(crop(png, box, width, height)));
    });
    console.log(`${suit}: 10 cartas`);
  }

  console.log(`\n40 cartas em ${width}x${height}px`);
  console.log(`CARD_ASPECT = ${(height / width).toFixed(4)}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
