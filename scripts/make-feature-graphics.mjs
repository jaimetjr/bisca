/**
 * Renders the 1024x500 Play Store feature graphic once per locale, into
 * `store/feature-graphics/<locale>/<locale>-feature-graphic.png`.
 *
 * Usage:
 *   node scripts/make-feature-graphics.mjs [--locales it,pt] [--headed]
 *
 * Design is the one already used by `store/feature-graphic.html`: the wordless
 * Ace card from `assets/brand/card-only.svg` on a green radial gradient, the
 * game's name in Inter Bold gold, a tagline, and three chips.
 *
 * Every string comes from `shared/i18n/translations.ts` — the app's own copy —
 * rather than being newly written here. That keeps these graphics free of
 * AI-authored text, so the Play Console "AI asset declaration" can honestly stay
 * unticked, exactly like the screenshots.
 *
 * Play falls back to the default language's graphic for any locale you skip, so
 * nothing breaks if you only upload a few.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

import { selectLocales } from './store-locales.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const HEADED = args.includes('--headed');

const ROOT = process.cwd();
const OUT_ROOT = path.join(ROOT, 'store', 'feature-graphics');
const WIDTH = 1024;
const HEIGHT = 500;

const url = (rel) => 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/');

const FONT_BOLD = url('node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf');
const FONT_MED = url('node_modules/@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf');
const CARD_SVG = url('assets/brand/card-only.svg');

const RTL = new Set(['ar']);
/**
 * Scripts where extra letter-spacing is wrong, not merely a style choice:
 * Arabic letters must stay joined, and CJK is already evenly spaced by design.
 */
const NO_TRACKING = new Set(['ar', 'ja', 'zh', 'ko']);

// ------------------------------------------------------------ translations

/** Pulls a locale's strings straight out of the app's translations file. */
function readTranslations() {
  const src = fs.readFileSync(path.join(ROOT, 'shared/i18n/translations.ts'), 'utf8');
  const heads = [...src.matchAll(/^ {2}([a-z]{2}): \{$/gm)];
  const out = {};

  for (let i = 0; i < heads.length; i++) {
    const start = heads[i].index;
    const end = i + 1 < heads.length ? heads[i + 1].index : src.length;
    const block = src.slice(start, end);

    const val = (key) => {
      const re = new RegExp("'" + key.replace(/\./g, '\\.') + "':\\s*'((?:\\\\.|[^'])*)'");
      const m = block.match(re);
      return m ? m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\') : null;
    };

    out[heads[i][1]] = {
      title: val('home.title'),
      tagline: val('home.subtitle'),
      chips: [val('home.cards'), val('home.modes'), val('home.winTarget')].filter(Boolean),
    };
  }
  return out;
}

const T = readTranslations();
const locales = selectLocales(flag('locales', ''));

// ------------------------------------------------------------ markup

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The title is the one line that can overflow: "Briscola" fits at 128px but
 * "Классическая…" style names and long Latin ones do not. Step the size down by
 * length rather than letting it clip.
 */
function titleSize(title) {
  const n = [...title].length;
  if (n <= 7) return 128;
  if (n <= 9) return 112;
  if (n <= 12) return 92;
  return 76;
}

function html(locale, t) {
  const dir = RTL.has(locale) ? 'rtl' : 'ltr';
  // Inter carries Latin, Greek and Cyrillic but no CJK or Arabic glyphs; fall
  // through to the platform faces for those so nothing renders as tofu.
  const stack = `'InterBold','Segoe UI','Yu Gothic','Meiryo','Malgun Gothic','Microsoft YaHei','Segoe UI Historic',sans-serif`;
  const stackMed = `'InterMed','Segoe UI','Yu Gothic','Meiryo','Malgun Gothic','Microsoft YaHei',sans-serif`;

  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8">
<style>
  @font-face { font-family: 'InterBold'; src: url('${FONT_BOLD}'); }
  @font-face { font-family: 'InterMed'; src: url('${FONT_MED}'); }
  html, body { margin: 0; padding: 0; }
  .canvas {
    width: ${WIDTH}px; height: ${HEIGHT}px;
    background: radial-gradient(120% 120% at 30% 20%, #2a7a4a 0%, #1E6F3F 45%, #123321 100%);
    display: flex; align-items: center; gap: 40px;
    padding: 0 72px; box-sizing: border-box;
    overflow: hidden; position: relative;
  }
  .cardwrap { flex-shrink: 0; filter: drop-shadow(0 16px 28px rgba(0,0,0,0.4)); }
  .text { display: flex; flex-direction: column; min-width: 0; }
  .title {
    font-family: ${stack};
    font-size: ${titleSize(t.title)}px; color: #E4B94C;
    letter-spacing: ${NO_TRACKING.has(locale) ? 0 : 4}px; line-height: 1; margin: 0;
    white-space: nowrap;
  }
  .tagline {
    font-family: ${stackMed};
    font-size: 32px; color: #eaf3ee;
    margin: 20px 0 0; opacity: 0.92; line-height: 1.25;
  }
  .chips { display: flex; gap: 14px; margin-top: 28px; flex-wrap: wrap; }
  .chip {
    font-family: ${stackMed}; font-size: 21px; color: #dfeee6;
    border: 1px solid rgba(255,255,255,0.35); border-radius: 999px;
    padding: 8px 20px; white-space: nowrap;
  }
</style>
</head>
<body>
  <div class="canvas">
    <div class="cardwrap">
      <img src="${CARD_SVG}" width="300" height="300" alt="">
    </div>
    <div class="text">
      <h1 class="title">${esc(t.title)}</h1>
      <p class="tagline">${esc(t.tagline)}</p>
      <div class="chips">
${t.chips.map((c) => `        <span class="chip">${esc(c)}</span>`).join('\n')}
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ------------------------------------------------------------ render

/** Scratch page, written inside the repo so file:// subresources resolve. */
const TMP_HTML = path.join(ROOT, 'store', '.feature-graphic.tmp.html');

const browser = await chromium.launch({ channel: 'msedge', headless: !HEADED });
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
const page = await context.newPage();

let done = 0;
const failures = [];

for (const { store, lang } of locales) {
  const t = T[lang];
  if (!t || !t.title || !t.tagline) {
    failures.push(`${store}: missing home.title/home.subtitle for '${lang}' in translations.ts`);
    continue;
  }
  const locale = lang; // drives text direction and tracking

  const dir = path.join(OUT_ROOT, store);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${store}-feature-graphic.png`);

  try {
    // Must be a real file:// page, not setContent(): Chromium refuses to load
    // file:// subresources (the card SVG, the Inter faces) from an about:blank
    // document, which silently yields a broken-image box.
    fs.writeFileSync(TMP_HTML, html(locale, t));
    await page.goto('file:///' + TMP_HTML.replace(/\\/g, '/'), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });

    const b = fs.readFileSync(file);
    const w = b.readUInt32BE(16);
    const h = b.readUInt32BE(20);
    if (w !== WIDTH || h !== HEIGHT) throw new Error(`wrote ${w}x${h}`);

    done++;
    console.log(`${store.padEnd(6)} ${t.title.padEnd(10)} ${(b.length / 1024).toFixed(0).padStart(4)}KB  ${file}`);
  } catch (err) {
    failures.push(`${store}: ${String(err).split('\n')[0]}`);
  }
}

await browser.close();
fs.rmSync(TMP_HTML, { force: true });

console.log(`\n${done}/${locales.length} feature graphics written under ${OUT_ROOT}`);
if (failures.length) {
  console.error('\nfailed:');
  for (const f of failures) console.error('  ' + f);
  process.exitCode = 1;
}
