/**
 * Captures Google Play phone screenshots from the Expo web build, one set per
 * locale, at the exact pixel size Play expects.
 *
 * Play allows 8 screenshots per listing; the repo shipped 3. Regenerate them
 * whenever the UI changes rather than re-cropping by hand.
 *
 * Usage:
 *   1. npx expo start --port 8097
 *   2. node scripts/capture-store-screenshots.mjs [--port 8097] [--locales it,pt] [--headed]
 *
 * Output: store/screenshots/<locale>/N-<name>.png at 860x1864.
 *
 * Notes
 * - Drives system Edge (`channel: 'msedge'`); no Playwright browser download.
 * - 430x932 CSS pixels at deviceScaleFactor 2 gives 860x1864, matching the
 *   screenshots already in the repo.
 * - Auth is bypassed by seeding the same AsyncStorage keys the app uses
 *   (AsyncStorage is localStorage on web) — far more robust than clicking a
 *   "Continue as Guest" button whose label changes in every locale.
 * - Every shot must render WITHOUT the API server. Stats, quests, achievements
 *   and the online lobby all sit on a spinner forever without a logged-in
 *   account, so they are deliberately not captured here; `guardText` exists to
 *   make that failure loud if anyone adds such a screen back.
 * - Captions are drawn as a DOM overlay before the shot, so no image library
 *   is needed. Each caption is attached to its shot rather than kept in a
 *   parallel array, which is what previously mislabelled the screenshots.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const PORT = flag('port', '8097');
const BASE = `http://localhost:${PORT}`;
const HEADED = args.includes('--headed');
const OUT_ROOT = path.resolve('store/screenshots');

/** Play phone screenshot target: 860x1864, as already used in this repo. */
const VIEWPORT = { width: 430, height: 932 };
const SCALE = 2;
/**
 * Below this much visible text a screen is a spinner or an error, not content.
 * Kept low on purpose: CJK screens say the same thing in far fewer characters
 * (a Korean 1v1 board is ~35 chars while the English one is ~70), so a
 * Latin-calibrated threshold rejects perfectly good shots. The real guarantee
 * that a screen finished loading is each shot's `ready` selector; this only has
 * to catch a bare spinner, which renders under ~15 characters.
 */
const MIN_VISIBLE_TEXT = Number(flag('min-text', '20'));

const ALL_LOCALES = ['pt', 'es', 'it', 'en', 'fr', 'de', 'ja', 'zh', 'ko', 'ar', 'ru', 'nl'];
const localesArg = flag('locales', '').trim();
const locales = localesArg ? localesArg.split(',').map((s) => s.trim()).filter(Boolean) : ALL_LOCALES;

const T = {
  home: {
    en: 'Play Brisca anywhere', pt: 'Joga à Bisca onde quiseres', es: 'Juega a la Brisca donde sea',
    it: 'Gioca a Briscola ovunque', fr: 'Jouez à la Brisca partout', de: 'Briscola überall spielen',
  },
  tutorial: {
    en: 'Learn the rules in seconds', pt: 'Aprende as regras num instante', es: 'Aprende las reglas en segundos',
    it: 'Impara le regole in un attimo', fr: 'Apprenez les règles en secondes', de: 'Regeln in Sekunden lernen',
  },
  points: {
    en: 'Know what every card is worth', pt: 'Sabe quanto vale cada carta', es: 'Conoce el valor de cada carta',
    it: 'Il valore di ogni carta', fr: 'La valeur de chaque carte', de: 'Was jede Karte zählt',
  },
  setup: {
    en: '1v1 or 2v2, your call', pt: '1v1 ou 2v2, tu escolhes', es: '1v1 o 2v2, tú eliges',
    it: '1v1 o 2v2, scegli tu', fr: '1v1 ou 2v2, à vous de choisir', de: '1v1 oder 2v2, du entscheidest',
  },
  game: {
    en: 'Smart AI opponents', pt: 'Adversários com IA', es: 'Rivales con IA',
    it: 'Avversari IA', fr: 'Adversaires IA', de: 'Schlaue KI-Gegner',
  },
  team: {
    en: 'Team play, 2v2', pt: 'Joga a pares, 2v2', es: 'Juega por parejas, 2v2',
    it: 'Gioca a coppie, 2v2', fr: 'Jouez en équipes, 2v2', de: 'Im Team spielen, 2v2',
  },
  practice: {
    en: 'Hints while you learn', pt: 'Dicas enquanto aprendes', es: 'Pistas mientras aprendes',
    it: 'Suggerimenti mentre impari', fr: 'Des conseils en jouant', de: 'Tipps beim Lernen',
  },
  settings: {
    en: 'Six card backs, 12 languages', pt: 'Seis versos, 12 idiomas', es: 'Seis reversos, 12 idiomas',
    it: 'Sei dorsi, 12 lingue', fr: 'Six dos de cartes, 12 langues', de: 'Sechs Rückseiten, 12 Sprachen',
  },
};

const caption = (key, locale) => T[key][locale] ?? T[key].en;

const GAME_READY = '[data-testid="game-table"]';
const startGame = async (page) => {
  await page.click('[data-testid="start-btn"]');
  await page.waitForSelector(GAME_READY, { timeout: 25000 });
  // Let the deal animation land and the first trick develop.
  await page.waitForTimeout(3500);
};

/**
 * `ready` must be a selector unique to the LOADED screen — never `body`, which
 * matches while a spinner is still turning.
 */
const SHOTS = [
  { name: 'home', caption: 'home', path: '/', ready: '[data-testid="play-ai-btn"]' },
  {
    name: 'tutorial', caption: 'tutorial', path: '/', ready: '[data-testid="how-to-play-btn"]',
    async act(page) {
      await page.click('[data-testid="how-to-play-btn"]');
      await page.waitForSelector('[data-testid="tutorial-modal"]', { timeout: 15000 });
      await page.waitForTimeout(600); // modal fades in
    },
  },
  {
    name: 'card-points', caption: 'points', path: '/', ready: '[data-testid="how-to-play-btn"]',
    async act(page) {
      await page.click('[data-testid="how-to-play-btn"]');
      await page.waitForSelector('[data-testid="tutorial-modal"]', { timeout: 15000 });
      await page.waitForTimeout(500);
      for (let i = 0; i < 2; i++) {
        const next = await page.$('[data-testid="tutorial-next-btn"]');
        if (!next) break;
        await next.click();
        await page.waitForTimeout(450);
      }
    },
  },
  { name: 'setup', caption: 'setup', path: '/setup', ready: '[data-testid="start-btn"]' },
  {
    name: 'game-1v1', caption: 'game', path: '/setup', ready: '[data-testid="start-btn"]',
    async act(page) {
      await page.click('[data-testid="count-2-btn"]');
      await startGame(page);
    },
  },
  {
    name: 'game-2v2', caption: 'team', path: '/setup', ready: '[data-testid="start-btn"]',
    async act(page) {
      await page.click('[data-testid="count-4-btn"]');
      await startGame(page);
    },
  },
  {
    // Practice mode is reachable straight from the URL and shows the coach banner.
    name: 'practice', caption: 'practice',
    path: '/game?mode=ai&practice=1&difficulty=easy&playerCount=2',
    ready: GAME_READY,
    async act(page) {
      await page.waitForTimeout(3500);
    },
  },
  {
    name: 'settings', caption: 'settings', path: '/settings', ready: '[data-testid="card-back-verde"]',
    async act(page) {
      // Scroll past the account block so the shot lands on the language grid and
      // card backs rather than a red "Exit Guest Mode" button.
      await page.evaluate(() => {
        const el = document.querySelector('[data-testid="card-back-verde"]');
        el?.scrollIntoView({ block: 'end' });
      });
      await page.waitForTimeout(600);
    },
  },
];

/** Seeds the app's own persisted state so the run starts past auth and in-locale. */
function seedScript(locale) {
  return `
    try {
      localStorage.setItem('guest_mode', 'true');
      localStorage.setItem('@bisca:tutorial_seen', 'true');
      localStorage.setItem('@bisca:settings', JSON.stringify({
        aiDifficulty: 'medium', gameSpeed: 'normal', language: ${JSON.stringify(locale)}, cardBack: 'verde'
      }));
    } catch (e) {}
  `;
}

async function addCaption(page, text) {
  await page.evaluate((c) => {
    document.getElementById('__shot_caption')?.remove();
    const el = document.createElement('div');
    el.id = '__shot_caption';
    el.textContent = c;
    Object.assign(el.style, {
      position: 'fixed', top: '0', left: '0', right: '0', zIndex: '2147483647',
      padding: '18px 20px 22px',
      background: 'linear-gradient(180deg, #0f2d1a 62%, rgba(15,45,26,0))',
      color: '#E8C96A',
      font: '700 21px/1.25 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      textAlign: 'center', letterSpacing: '-0.01em', pointerEvents: 'none',
    });
    document.body.appendChild(el);
  }, text);
}

/** Rejects spinner/error screens before they get written as a store asset. */
async function guardText(page, name) {
  const len = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim().length);
  if (len < MIN_VISIBLE_TEXT) {
    throw new Error(`only ${len} chars of visible text — screen did not finish loading`);
  }
  return len;
}

async function main() {
  const probe = await fetch(BASE).catch(() => null);
  if (!probe || !probe.ok) {
    console.error(`Metro is not answering on ${BASE}.\nStart it first:  npx expo start --port ${PORT}`);
    process.exit(1);
  }

  const browser = await chromium.launch({ channel: 'msedge', headless: !HEADED });
  let captured = 0;
  const failures = [];

  for (const locale of locales) {
    const outDir = path.join(OUT_ROOT, locale);
    fs.mkdirSync(outDir, { recursive: true });

    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, locale });
    await context.addInitScript(seedScript(locale));
    const page = await context.newPage();

    let ok = 0;
    for (const [i, shot] of SHOTS.entries()) {
      const file = path.join(outDir, `${i + 1}-${shot.name}.png`);
      try {
        await page.goto(`${BASE}${shot.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector(shot.ready, { timeout: 30000 });
        await page.waitForTimeout(900);
        if (shot.act) await shot.act(page);
        await guardText(page, shot.name);
        await addCaption(page, caption(shot.caption, locale));
        await page.screenshot({ path: file });
        ok++;
      } catch (err) {
        const msg = String(err).split('\n')[0];
        failures.push(`${locale}/${shot.name}: ${msg}`);
        console.warn(`  [${locale}] ${shot.name}: ${msg}`);
      }
    }

    captured += ok;
    console.log(`${locale}: ${ok}/${SHOTS.length} -> ${outDir}`);
    await context.close();
  }

  await browser.close();

  const expected = locales.length * SHOTS.length;
  console.log(`\n${captured}/${expected} screenshots written under ${OUT_ROOT}`);
  if (failures.length) {
    console.error(`\n${failures.length} failed:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
