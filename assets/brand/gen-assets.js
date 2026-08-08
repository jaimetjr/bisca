/*
 * Renders all Brisca brand PNGs from the SVG sources into assets/images/.
 *
 * Note for the card backs: the app loads them as `.webp`, not `.png`. Run
 * `node scripts/webp-cards.mjs` after this to re-encode assets/images/spanish/ —
 * without it the new backs sit on disk as PNGs that nothing imports, and
 * tests/unit/card-backs.test.ts is what catches that.
 */
const { chromium } = require('c:/Users/Junior/Dev/study/bisca/node_modules/playwright');
const path = require('path');
const { cardBacks, OUT_W, OUT_H } = require('./card-backs');

const BRAND = __dirname;
const OUT = 'c:/Users/Junior/Dev/study/bisca/assets/images';
const fileUrl = (p) => 'file://' + p.replace(/\\/g, '/');

// `size` is a number for the square icon assets, or [width, height] for the card back.
async function renderSvg(browser, svgName, size, outName, transparent) {
  const [width, height] = Array.isArray(size) ? size : [size, size];
  // goto the SVG document directly (file:// origin) — setContent/about:blank cannot load file:// images.
  // The SVGs have viewBox only (no width/height), so they fill the viewport exactly.
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(fileUrl(path.join(BRAND, svgName)));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, outName), omitBackground: !!transparent });
  await page.close();
  console.log(`${outName} <- ${svgName} @ ${width}x${height}${transparent ? ' (transparent)' : ''}`);
}

// The card backs are built in memory by card-backs.js rather than read off disk.
// setContent is fine for them (unlike the brand SVGs) because they are pure
// geometry with no external image or font references to resolve.
async function renderSvgSource(browser, svg, width, height, outName) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
  );
  await page.screenshot({ path: path.join(OUT, outName), omitBackground: true });
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  await renderSvg(browser, 'icon.svg', 1024, 'icon.png', false);
  await renderSvg(browser, 'card-fg.svg', 512, 'android-icon-foreground.png', true);
  await renderSvg(browser, 'adaptive-bg.svg', 512, 'android-icon-background.png', false);
  await renderSvg(browser, 'card-monochrome.svg', 432, 'android-icon-monochrome.png', true);
  await renderSvg(browser, 'favicon.svg', 48, 'favicon.png', false);

  // Card backs, one per colourway the player can pick in Settings. Rendered far
  // smaller than the card faces on purpose — see the note in card-backs.js.
  for (const { id, svg } of cardBacks) {
    await renderSvgSource(browser, svg, OUT_W, OUT_H, `spanish/reverso-${id}.png`);
  }
  console.log(`${cardBacks.length} versos <- card-backs.js @ ${OUT_W}x${OUT_H} (transparent)`);

  // splash: HTML composition (coin + wordmark), transparent background
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
  await page.goto(fileUrl(path.join(BRAND, 'splash.html')));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'splash-icon.png'), omitBackground: true });
  await page.close();
  console.log('splash-icon.png <- splash.html @ 1024 (transparent)');

  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
