/**
 * Gives the Rey de Copas its cup.
 *
 * The purchased deck shows the suit on every card but this one. The number
 * cards *are* their suit; the espadas and bastos figures hold theirs; all three
 * oros faces carry a coin; the 10 and 11 of copas each draw a cup beside the
 * rank number. The king holds a fleur-de-lis sceptre and carries no cup
 * anywhere, so nothing on the card says which suit it is. Confirmed against
 * `assets/source/cups.ai` — the sheet is drawn that way, so re-extracting will
 * not fix it. In a game decided by the trump suit, a card whose suit you cannot
 * read is a real problem, not a cosmetic one.
 *
 * The obvious fix — drop the cup into the empty space beside the "12" — does not
 * work, and the arithmetic says why. Across the rows a cup occupies:
 *
 *     "12" ends at 136 + gap 18 + cup 104 + gap 12 + king 325 = 595
 *                                    inner edge of the frame  = 580
 *
 * Fifteen pixels short. Something has to give, and the options were a cup ~10%
 * smaller than its siblings, a king ~5% smaller than the other three kings, or
 * moving the rank number. Moving the number is the only one that costs nothing:
 * this card's "12" sits 24px further right than the "11" does on its card, so
 * shifting it left *fixes* an existing inconsistency rather than creating one.
 *
 * So three things move, all by translation and never by scaling — no element is
 * resized, and the deck's own cup is used at its true size:
 *
 *   - the "12" goes left, to the same inset from the frame the "11" has;
 *   - the king goes right, far enough to clear the cup across its rows only —
 *     the robe lower down stays exactly where the artist put it;
 *   - the cup lands in the gap that opens, at 100%.
 *
 * Which pixels belong to what is decided by connected blobs of ink, not by
 * rectangles. Rectangles were tried twice and failed twice: the robe reaches
 * into the bottom number's corner, so a generous box strands 56px of blue on
 * the number once the figure moves out from under it, and a box derived from
 * the card's symmetry cuts the rotated "1" in half and drags the piece along.
 * The king is one connected drawing, each numeral is its own, and the frame is
 * another — so moving whole blobs cannot tear anything.
 *
 * IMPORTANT: this is a post-step of the art pipeline, not a one-off manual edit.
 * Re-extracting the deck overwrites the file with the cupless original again:
 *
 *   node scripts/extract-cards.mjs && node scripts/webp-cards.mjs && node scripts/fix-rey-copas.mjs
 *
 * Idempotent: it probes the slot and exits if a cup is already there.
 * `tests/unit/card-assets.test.ts` guards size, transparency and byte budget.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = path.join(ROOT, 'assets/source/cups.ai');
const CARD = path.join(ROOT, 'assets/images/spanish/12-copas.webp');

/** Matches `webp-cards.mjs`; see the quality measurements documented there. */
const QUALITY = 0.85;
/** A cheap render, only used to find the dpi that yields a 620px-wide card. */
const PROBE_DPI = 20;
/** Grid position of each rank: row 0 is 1-5, row 1 is 6, 7, 10, 11, 12. */
const KNIGHT = 8;
const KING = 9;

/** How far the "12" moves left, to sit at the inset the "11" uses. */
const RANK_SHIFT = 24;
/** Clear space either side of the cup, in px on a 620px-wide card. */
const GAP_BEFORE = 14;
const GAP_AFTER = 10;
/** Everything outside this inset is the printed frame, which never moves. */
const INSET = 40;
/** Clear space the king must keep from the printed frame he is pushed towards. */
const FRAME_CLEARANCE = 6;

const isWhite = (d, i) => d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235;
const isInk = (png, x, y) => {
  const i = (y * png.width + x) * 4;
  return png.data[i + 3] > 128 && !isWhite(png.data, i);
};

function contentRuns(png, axis, band) {
  const [outerLen, innerLen] = axis === 'x' ? [png.width, png.height] : [png.height, png.width];
  const [lo, hi] = band ?? [0, innerLen - 1];
  const runs = [];
  let start = null;
  for (let o = 0; o < outerLen; o++) {
    let blank = true;
    for (let i = lo; i <= hi; i++) {
      const idx = (axis === 'x' ? i * png.width + o : o * png.width + i) * 4;
      if (png.data[idx + 3] >= 16) { blank = false; break; }
    }
    if (!blank && start === null) start = o;
    else if (blank && start !== null) { runs.push([start, o - 1]); start = null; }
  }
  if (start !== null) runs.push([start, outerLen - 1]);
  return runs;
}

function locateCards(png) {
  const rows = contentRuns(png, 'y');
  if (rows.length !== 2) throw new Error(`esperava 2 fileiras, achei ${rows.length}`);
  const boxes = [];
  for (const [top, bottom] of rows) {
    const cols = contentRuns(png, 'x', [top, bottom]);
    if (cols.length !== 5) throw new Error(`esperava 5 cartas na fileira, achei ${cols.length}`);
    for (const [left, right] of cols) boxes.push({ left, top, right, bottom });
  }
  return boxes;
}

/**
 * Columns of a card carrying real ink across a row band, grouped into blobs.
 * The threshold drops the printed frame, a hairline crossing every column.
 */
function inkGroups(png, card, yA, yB, xLimit) {
  const width = card.right - card.left + 1;
  const solid = [];
  for (let x = card.left; x <= card.left + Math.round(width * xLimit); x++) {
    let n = 0;
    for (let y = yA; y <= yB; y++) if (isInk(png, x, y)) n++;
    solid.push(n > (yB - yA) * 0.05 ? 1 : 0);
  }
  const groups = [];
  let start = null;
  solid.forEach((v, i) => {
    if (v && start === null) start = i;
    if (!v && start !== null) { groups.push([start, i - 1]); start = null; }
  });
  if (start !== null) groups.push([start, solid.length - 1]);
  return groups.filter(([a, b]) => b - a + 1 > width * 0.008);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rey-copas-'));
try {
  // --- Find the dpi that renders a card at the width the deck ships at, so the
  // cup rasterises at its final size instead of being resampled into it.
  // Width straight out of the card's VP8X header — it is a WebP, not a PNG.
  const cardBuf = fs.readFileSync(CARD);
  if (cardBuf.subarray(12, 16).toString('ascii') !== 'VP8X') throw new Error('carta sem cabeçalho VP8X');
  const targetWidth = 1 + (cardBuf[24] | (cardBuf[25] << 8) | (cardBuf[26] << 16));
  execFileSync('pdftocairo', ['-png', '-r', String(PROBE_DPI), '-transp', SHEET, path.join(tmp, 'probe')]);
  const probe = PNG.sync.read(fs.readFileSync(path.join(tmp, 'probe-1.png')));
  const probeCard = locateCards(probe)[KNIGHT];
  const dpi = (PROBE_DPI * targetWidth) / (probeCard.right - probeCard.left + 1);
  execFileSync('pdftocairo', ['-png', '-r', String(dpi), '-transp', SHEET, path.join(tmp, 'sheet')]);
  const sheet = PNG.sync.read(fs.readFileSync(path.join(tmp, 'sheet-1.png')));
  const cards = locateCards(sheet);

  // --- The cup, off the 11.
  const knight = cards[KNIGHT];
  const kh = knight.bottom - knight.top + 1;
  const roughA = knight.top + Math.round(kh * 0.045);
  const roughB = knight.top + Math.round(kh * 0.22);
  const cupCols = inkGroups(sheet, knight, roughA, roughB, 0.55)
    .reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  // First contiguous run of inked rows; first-to-last would swallow the white
  // gap under the cup and run on into the horse's mane.
  const rowRuns = [];
  {
    let start = null;
    for (let y = knight.top + Math.round(kh * 0.03); y <= knight.top + Math.round(kh * 0.35); y++) {
      let n = 0;
      for (let x = knight.left + cupCols[0]; x <= knight.left + cupCols[1]; x++) if (isInk(sheet, x, y)) n++;
      if (n > 3 && start === null) start = y;
      if (n <= 3 && start !== null) { rowRuns.push([start, y - 1]); start = null; }
    }
    if (start !== null) rowRuns.push([start, knight.top + Math.round(kh * 0.35)]);
  }
  const cupRows = rowRuns.find(([a, b]) => b - a + 1 > kh * 0.05);
  if (!cupRows) throw new Error('não achei a taça na carta 11');
  const cup = {
    x: knight.left + cupCols[0], y: cupRows[0],
    w: cupCols[1] - cupCols[0] + 1, h: cupRows[1] - cupRows[0] + 1,
  };
  const cupTopFrac = (cupRows[0] - knight.top) / kh;

  const crop = new PNG({ width: cup.w, height: cup.h });
  PNG.bitblt(sheet, crop, cup.x, cup.y, cup.w, cup.h, 0, 0);
  const cupUri = `data:image/png;base64,${PNG.sync.write(crop).toString('base64')}`;
  const cardUri = `data:image/webp;base64,${fs.readFileSync(CARD).toString('base64')}`;

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const out = await page.evaluate(async (P) => {
    const load = async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; };
    const card = await load(P.cardUri);
    const cupImg = await load(P.cupUri);
    const W = card.naturalWidth, H = card.naturalHeight;

    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const src = (() => {
      const c = mk();
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(card, 0, 0);
      return x.getImageData(0, 0, W, H);
    })();
    const white = (d, i) => d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235;

    /**
     * Split the card into connected blobs of ink and move whole blobs.
     *
     * Boxes were tried twice and failed twice. The robe reaches into the bottom
     * number's corner, so no rectangle contains one without clipping the other:
     * a generous box strands 56px of blue on the number, and a box derived from
     * the card's symmetry cuts the rotated "1" in half and drags the piece
     * along with the figure. Blobs have no such ambiguity — the king is one
     * connected drawing, each numeral is its own, and the printed frame is
     * another. Nothing here needs to know where anything is.
     */
    const N = W * H;
    const inkAt = new Uint8Array(N);
    for (let i = 0, p = 0; p < N; p++, i += 4) {
      inkAt[p] = (src.data[i + 3] > 128 && !white(src.data, i)) ? 1 : 0;
    }
    const label = new Int32Array(N).fill(-1);
    const blobs = [];
    const stack = new Int32Array(N);
    for (let seed = 0; seed < N; seed++) {
      if (!inkAt[seed] || label[seed] !== -1) continue;
      const id = blobs.length;
      const box = { L: W, R: -1, T: H, B: -1, n: 0 };
      let sp = 0;
      stack[sp++] = seed;
      label[seed] = id;
      while (sp > 0) {
        const p = stack[--sp];
        const px = p % W, py = (p - px) / W;
        box.n++;
        if (px < box.L) box.L = px; if (px > box.R) box.R = px;
        if (py < box.T) box.T = py; if (py > box.B) box.B = py;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const q = ny * W + nx;
          if (inkAt[q] && label[q] === -1) { label[q] = id; stack[sp++] = q; }
        }
      }
      blobs.push(box);
    }
    // The king is the biggest drawing on the card by a wide margin.
    let figureId = 0;
    blobs.forEach((b, i) => { if (b.n > blobs[figureId].n) figureId = i; });
    // The rank numerals: blobs sitting in the top-left corner, frame aside.
    const topRankIds = blobs
      .map((b, i) => ({ b, i }))
      .filter(({ b, i }) => i !== figureId && b.R < W * 0.30 && b.B < H * 0.14 && b.n > 40)
      .map(({ i }) => i);
    if (!topRankIds.length) throw new Error('não achei o "12" de cima');

    const fig = { ...blobs[figureId] };
    const rank = topRankIds.reduce((acc, i) => ({
      L: Math.min(acc.L, blobs[i].L), R: Math.max(acc.R, blobs[i].R),
      T: Math.min(acc.T, blobs[i].T), B: Math.max(acc.B, blobs[i].B),
    }), { L: W, R: -1, T: H, B: -1 });

    const figC = mk(), rankC = mk(), bgC = mk();
    const figD = figC.getContext('2d').createImageData(W, H);
    const rankD = rankC.getContext('2d').createImageData(W, H);
    const bgD = bgC.getContext('2d').createImageData(W, H);
    bgD.data.set(src.data);
    const isTopRank = new Uint8Array(blobs.length);
    topRankIds.forEach((i) => { isTopRank[i] = 1; });
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      const id = label[p];
      if (id === -1) continue;
      const target = id === figureId ? figD : isTopRank[id] ? rankD : null;
      if (!target) continue; // frame and the bottom numeral never move
      for (let k = 0; k < 4; k++) target.data[i + k] = src.data[i + k];
      bgD.data[i] = 255; bgD.data[i + 1] = 255; bgD.data[i + 2] = 255; bgD.data[i + 3] = 255;
    }
    figC.getContext('2d').putImageData(figD, 0, 0);
    rankC.getContext('2d').putImageData(rankD, 0, 0);
    bgC.getContext('2d').putImageData(bgD, 0, 0);

    const cupW = cupImg.naturalWidth, cupH = cupImg.naturalHeight;
    const cupTop = Math.round(P.cupTopFrac * H);
    // Already has one? Probe the middle of the bowl.
    const probe = src.data.slice(((cupTop + Math.round(cupH * 0.15)) * W + Math.round(W * 0.25)) * 4);
    if (!(probe[3] < 128 || white(probe, 0))) return { skipped: true };

    // Only the rows the cup occupies constrain the king; the robe below is free.
    // The printed frame's inner edge, measured: its vertical rules are the only
    // columns inked down most of the card. Assuming it sat at W - INSET is what
    // made an earlier estimate of the spare room too optimistic by 5px.
    let frameRight = W - P.INSET;
    for (let x = W - 1; x > W * 0.8; x--) {
      let n = 0;
      for (let y = 0; y < H; y++) {
        const i = (y * W + x) * 4;
        if (src.data[i + 3] > 128 && !white(src.data, i)) n++;
      }
      if (n > H * 0.5 && x < W - 8) { frameRight = x; break; }
    }

    const figData = figC.getContext('2d').getImageData(0, 0, W, H).data;
    let figLeftInBand = W;
    for (let y = cupTop; y < cupTop + cupH; y++) for (let x = 0; x < W; x++) {
      if (figData[(y * W + x) * 4 + 3] > 128) { if (x < figLeftInBand) figLeftInBand = x; break; }
    }

    const glyphRight = rank.R - P.RANK_SHIFT;
    const cupLeft = glyphRight + P.GAP_BEFORE;
    const shift = Math.max(0, cupLeft + cupW + P.GAP_AFTER - figLeftInBand);

    const cv = mk();
    const x = cv.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingQuality = 'high';
    x.drawImage(bgC, 0, 0);
    x.drawImage(rankC, rank.L, rank.T, rank.R - rank.L + 1, rank.B - rank.T + 1,
      rank.L - P.RANK_SHIFT, rank.T, rank.R - rank.L + 1, rank.B - rank.T + 1);
    x.drawImage(figC, fig.L, fig.T, fig.R - fig.L + 1, fig.B - fig.T + 1,
      fig.L + shift, fig.T, fig.R - fig.L + 1, fig.B - fig.T + 1);
    x.drawImage(cupImg, cupLeft, cupTop);

    return {
      skipped: false, W, H, rank, fig, shift, glyphRight, cupLeft,
      cupRight: cupLeft + cupW, figRight: fig.R + shift, frameRight, margin: frameRight - (fig.R + shift),
      blobs: blobs.length, figurePx: blobs[figureId].n, b64: cv.toDataURL('image/webp', P.QUALITY).split(',')[1],
    };
  }, { cardUri, cupUri, cupTopFrac, INSET, RANK_SHIFT, GAP_BEFORE, GAP_AFTER, QUALITY });
  await browser.close();

  if (out.skipped) {
    console.log('12-copas.webp já tem a taça — nada a fazer.');
    process.exit(0);
  }
  console.log('medido:', JSON.stringify({
    rank: out.rank, figura: out.fig, glyphRight: out.glyphRight,
    taça: [out.cupLeft, out.cupRight], shift: out.shift, moldura: out.frameRight,
    figRight: out.figRight, margem: out.margin, blobs: out.blobs,
  }));
  if (out.margin < FRAME_CLEARANCE) throw new Error(`rei ficou a ${out.margin}px da moldura (x ${out.frameRight})`);

  const buf = Buffer.from(out.b64, 'base64');
  if (buf.subarray(0, 4).toString('ascii') !== 'RIFF' || buf.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error('saída não é WebP');
  }
  if (buf.subarray(12, 16).toString('ascii') !== 'VP8X') throw new Error('WebP sem VP8X');
  if ((buf[20] & 0x10) === 0) throw new Error('WebP perdeu a transparência');
  const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
  const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
  if (w !== out.W || h !== out.H) throw new Error(`dimensões mudaram: ${out.W}x${out.H} -> ${w}x${h}`);

  const before = fs.statSync(CARD).size;
  fs.writeFileSync(CARD, buf);
  console.log(`taça: ${cup.w}x${cup.h}px do vetor, tamanho real (dpi ${dpi.toFixed(1)})`);
  console.log(`"12" -${RANK_SHIFT}px -> termina em ${out.glyphRight}`);
  console.log(`taça em ${out.cupLeft}..${out.cupRight}`);
  console.log(`${out.blobs} blobs; a figura tem ${out.figurePx}px`);
  console.log(`rei +${out.shift}px -> termina em ${out.figRight}, ${out.margin}px da moldura`);
  console.log(`12-copas.webp  ${w}x${h}  ${(before / 1024).toFixed(1)}KB -> ${(buf.length / 1024).toFixed(1)}KB`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
