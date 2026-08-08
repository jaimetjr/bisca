/**
 * Re-encodes the Spanish card art from PNG to WebP, in place.
 *
 * The faces come out of `extract-cards.mjs` as 620x1016 RGBA PNGs, which is the
 * right *resolution* (a 190dp card on a @3x tablet is 570px) and the wrong
 * *format*: the set weighed 6.75MB, an average of 169KB a card and a peak of
 * 350KB, and every one of them decodes to ~2.5MB of bitmap. That is what the
 * "cards take a long time to appear, sometimes very long" report is made of —
 * 40 cards is more than the decoded-bitmap cache holds, so cards get evicted and
 * re-decoded mid-match, and in dev Metro serves each one over HTTP on first use.
 *
 * WebP at q0.85 takes the same pixels to 2.34MB (2.9x). Resolution is
 * deliberately *not* touched: dropping to 480px would save another 0.7MB and
 * start showing on a tablet, where a played card runs to 269dp.
 *
 * On the quality number, measured rather than assumed. Comparing decoded pixels
 * against the source PNG, composited over white:
 *
 *   quality   set size   PSNR    max err
 *   0.85      2.25MB     32.6dB  121
 *   0.90      2.62MB     32.9dB  124
 *   0.95      3.16MB     33.1dB  122
 *   1.00      4.86MB     85.8dB  1
 *
 * Everything below 1.0 sits on a plateau — paying 40% more bytes for 0.5dB buys
 * nothing, because the error is chroma subsampling (4:2:0), which the quality
 * slider does not control, and this art is bold flat colour against white, which
 * is the worst case for it. Only q1.0 (lossless) escapes, at 2x the size.
 *
 * That 32.6dB is a 1:1 comparison, which never happens on screen. Re-measured at
 * the sizes cards actually render:
 *
 *   trump   65dp @3x = 195px   39.6dB   max err 39
 *   played  83dp @3x = 249px   35.8dB   max err 47
 *   hand   105dp @3x = 315px   37.1dB   max err 64
 *   tablet 269dp @2x = 538px   34.6dB   max err 104
 *
 * 35-40dB on downscaled line art is not perceptible at phone viewing distance,
 * which is why q0.85 stands. Pass `--quality=1` to go lossless if that judgement
 * is ever revisited; the sources in assets/source/ regenerate the PNGs via
 * extract-cards.mjs.
 *
 * Rendered through headless Edge rather than a native encoder because that is
 * already this repo's image pipeline — see `assets/brand/gen-assets.js`. The
 * emitted chunks are VP8X/ICCP/ALPH/VP8; `ALPH` is the one that matters, since
 * the transparent rounded corners are what let a card sit on the green felt.
 *
 * Idempotent: converts every .png next to its .webp, verifies the result decodes
 * back to identical dimensions, and only then removes the source. Re-running
 * once the directory is WebP is a no-op.
 *
 * Usage: node scripts/webp-cards.mjs [--keep-png] [--quality=0.85]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'assets/images/spanish');

/** See the quality table above before changing this. */
const DEFAULT_QUALITY = 0.85;

const keepPng = process.argv.includes('--keep-png');
const qualityArg = process.argv.find((a) => a.startsWith('--quality='));
const QUALITY = qualityArg ? Number(qualityArg.split('=')[1]) : DEFAULT_QUALITY;
if (!(QUALITY > 0 && QUALITY <= 1)) {
  throw new Error(`--quality precisa estar entre 0 e 1, recebi ${QUALITY}`);
}

/** width/height out of a WebP VP8X header, plus the alpha it must have kept. */
function webpSize(buf) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RIFF'
    || buf.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error('not a WebP file');
  }
  if (buf.subarray(12, 16).toString('ascii') !== 'VP8X') {
    throw new Error('WebP has no VP8X chunk');
  }
  // Byte 20 is the VP8X feature-flag byte; 0x10 is alpha. Checked as a flag
  // rather than by looking for an ALPH chunk, because lossless (--quality=1)
  // carries alpha inside VP8L and emits no ALPH at all.
  if (!(buf[20] & 0x10)) throw new Error('WebP lost its alpha channel');
  // VP8X stores each dimension minus one, as 24-bit little-endian.
  return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
}

function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png')).sort();
if (files.length === 0) {
  console.log('Nada a converter — nenhum .png em assets/images/spanish.');
  await browser.close();
  process.exit(0);
}

let before = 0;
let after = 0;

for (const file of files) {
  const src = path.join(DIR, file);
  const srcBuf = fs.readFileSync(src);
  const want = pngSize(srcBuf);

  // Drawn at its own size: this step changes the container, never the pixels.
  const b64 = await page.evaluate(async ({ data, quality }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', quality).split(',')[1];
  }, { data: srcBuf.toString('base64'), quality: QUALITY });

  const outBuf = Buffer.from(b64, 'base64');
  const got = webpSize(outBuf);
  if (got.width !== want.width || got.height !== want.height) {
    throw new Error(
      `${file}: ${want.width}x${want.height} virou ${got.width}x${got.height}`,
    );
  }

  const dest = src.replace(/\.png$/, '.webp');
  fs.writeFileSync(dest, outBuf);
  if (!keepPng) fs.unlinkSync(src);

  before += srcBuf.length;
  after += outBuf.length;
  console.log(
    `${path.basename(dest).padEnd(22)} ${kb(srcBuf.length).padStart(6)} -> ${kb(outBuf.length).padStart(6)}`
    + `  (${(srcBuf.length / outBuf.length).toFixed(1)}x)`,
  );
}

await browser.close();

console.log('-'.repeat(52));
console.log(
  `${String(files.length).padStart(2)} arquivos  `
  + `${(before / 1024 / 1024).toFixed(2)}MB -> ${(after / 1024 / 1024).toFixed(2)}MB`
  + `  (${(before / after).toFixed(1)}x menor)`,
);
if (keepPng) console.log('\n--keep-png: os .png originais foram mantidos.');
