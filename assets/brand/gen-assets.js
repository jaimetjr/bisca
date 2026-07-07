/* Renders all Brisca brand PNGs from the SVG sources into assets/images/. */
const { chromium } = require('c:/Users/Junior/Dev/study/bisca/node_modules/playwright');
const path = require('path');

const BRAND = __dirname;
const OUT = 'c:/Users/Junior/Dev/study/bisca/assets/images';
const fileUrl = (p) => 'file://' + p.replace(/\\/g, '/');

async function renderSvg(browser, svgName, size, outName, transparent) {
  // goto the SVG document directly (file:// origin) — setContent/about:blank cannot load file:// images.
  // The SVGs have viewBox only (no width/height), so they fill the viewport exactly.
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.goto(fileUrl(path.join(BRAND, svgName)));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, outName), omitBackground: !!transparent });
  await page.close();
  console.log(`${outName} <- ${svgName} @ ${size}${transparent ? ' (transparent)' : ''}`);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  await renderSvg(browser, 'icon.svg', 1024, 'icon.png', false);
  await renderSvg(browser, 'card-fg.svg', 512, 'android-icon-foreground.png', true);
  await renderSvg(browser, 'adaptive-bg.svg', 512, 'android-icon-background.png', false);
  await renderSvg(browser, 'card-monochrome.svg', 432, 'android-icon-monochrome.png', true);
  await renderSvg(browser, 'favicon.svg', 48, 'favicon.png', false);

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
