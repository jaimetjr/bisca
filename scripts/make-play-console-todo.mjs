/**
 * Generates `store/TODO-play-console.md` — a paste-ready, per-language checklist
 * of the Play Console work — straight out of `store/listing.md`, so the two can
 * never drift.
 *
 * Run after editing any listing copy:
 *   node scripts/make-play-console-todo.mjs
 *
 * Fields are identified by the character limit declared in their own heading
 * (30 = app name, 80 = short description, 4000 = full description) rather than
 * by heading text, because each locale block writes its headings in its own
 * language — and Japanese, Chinese, Korean and Arabic also use full-width
 * parentheses.
 *
 * Verify the limits separately with `node scripts/check-store-listing.mjs`.
 */
import fs from 'node:fs';

const SRC = 'store/listing.md';
const OUT = 'store/TODO-play-console.md';

const LOCALE_RE = /^# (?:Primary listing|Localization) — (.+?)\s*(?:·.*)?$/;
const FIELD_RE = /^##[^(（]*[(（][^)）]*?(\d{2,4})[^)）]*[)）]/;
const FIELD_BY_LIMIT = { 30: 'name', 80: 'short', 4000: 'full' };

/**
 * Play Console's own language names, in the order to work through them.
 * `why` explains the priority so the list cannot be mistaken for alphabetical.
 */
const PLAN = [
  { key: 'Italiano', console: 'Italiano (Italia) – it-IT', tier: 1,
    why: 'Briscola is played across Italy and the app already speaks Italian. Right now Italians searching "briscola" cannot find you at all. This is the single biggest new market available.' },
  { key: 'Português (Portugal)', console: 'Português (Portugal) – pt-PT', tier: 1,
    why: 'Bisca is one of Portugal\'s most played card games, after Sueca. Separate from pt-BR, not a replacement — this copy is European Portuguese ("telemóvel", "joga à Bisca").' },
  { key: 'Español', console: 'Español (España) – es-ES', tier: 1,
    why: 'The largest Brisca-speaking audience, and also the most competitive. Worth having, but do not expect to outrank the incumbents.' },
  { key: 'English', console: 'English (United States) – en-US', tier: 1,
    why: 'The fallback listing for every country whose language you do not cover.' },
  { key: 'Français', console: 'Français (France) – fr-FR', tier: 2,
    why: 'Mostly diaspora and southern-France demand. Cheap to add, modest return.' },
  { key: 'Deutsch', console: 'Deutsch (Deutschland) – de-DE', tier: 2,
    why: 'Briscola is known in Germany largely through the Italian community.' },
  { key: 'Nederlands', console: 'Nederlands (Nederland) – nl-NL', tier: 2,
    why: 'Small but real; costs nothing beyond the paste.' },
  { key: 'Русский', console: 'Русский – ru-RU', tier: 2,
    why: 'Marginal. Include for coverage.' },
  { key: '日本語', console: '日本語 – ja-JP', tier: 3,
    why: 'Completeness only — effectively nobody searches for this game in Japan.' },
  { key: '简体中文', console: '中文 (简体) – zh-CN', tier: 3,
    why: 'Completeness only. Note Google Play is unavailable in mainland China; this reaches Chinese speakers elsewhere.' },
  { key: '한국어', console: '한국어 – ko-KR', tier: 3,
    why: 'Completeness only — no meaningful organic demand in Korea.' },
  { key: 'العربية', console: 'العربية – ar', tier: 3,
    why: 'Completeness only — no meaningful organic demand in Arabic-speaking markets.' },
];

// ---------------------------------------------------------------- parse

const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
const byLocale = {};
let locale = '';

for (let i = 0; i < lines.length; i++) {
  const loc = lines[i].match(LOCALE_RE);
  if (loc) {
    locale = loc[1].trim();
    byLocale[locale] ??= {};
    continue;
  }
  const field = lines[i].match(FIELD_RE);
  if (!field || !locale) continue;

  const key = FIELD_BY_LIMIT[Number(field[1])];
  if (!key) continue;

  const body = [];
  for (let j = i + 1; j < lines.length; j++) {
    if (/^(##? |---)/.test(lines[j])) break;
    body.push(lines[j]);
  }
  byLocale[locale][key] = body.join('\n').trim();
}

function pick(prefix) {
  const hit = Object.keys(byLocale).find((k) => k.startsWith(prefix));
  if (!hit) throw new Error(`locale not found in ${SRC}: ${prefix}`);
  const v = byLocale[hit];
  for (const f of ['name', 'short', 'full']) {
    if (!v[f]) throw new Error(`${hit} is missing its ${f} field`);
  }
  return v;
}

/** Play counts characters, not bytes — measure by code point. */
const len = (s) => [...s].length;
const fence = (s) => ['```', s, '```'].join('\n');

const br = pick('Português (Brasil)');

/** One numbered section per language. */
function section(n, item) {
  const v = pick(item.key);
  return `## ${n}. Add ${item.console}${item.tier === 3 ? '  *(low priority)*' : ''}

${item.why}

Manage languages → add **${item.console}**, then select it in the dropdown.

**App name** — ${len(v.name)}/30

${fence(v.name)}

**Short description** — ${len(v.short)}/80

${fence(v.short)}

**Full description** — ${len(v.full)}/4000

${fence(v.full)}`;
}

const languageSections = PLAN.map((item, i) => section(i + 2, item)).join('\n\n---\n\n');
const nextNumber = PLAN.length + 2;

// ---------------------------------------------------------------- render

const doc = `# Play Console — what to update

Paste-ready, every language. Work top to bottom; you can stop after any section.

Generated from \`store/listing.md\` by \`scripts/make-play-console-todo.mjs\`.
Re-run that script after editing any listing copy so the two cannot drift.

**Where:** Play Console → Grow users → Store presence → **Store listings**.

**Current state (confirmed 2026-08-30):** only the default **Portuguese (Brazil)**
listing exists. Every other language below has to be created.

**The same three steps for every language:**

1. In the language dropdown at the top of Store listings, choose **Manage languages**.
2. Add the language, then select it in that dropdown.
3. Paste **App name**, **Short description** and **Full description**, then Save.

Character counts are shown against each field and all of them fit.

---

## 1. Widen the pt-BR app name — 30 seconds, highest payoff

This is the one language you already have, and its app name is currently just
"Bisca" — 5 of 30 characters. App name is the heaviest field in Play search
ranking, so the other 25 characters are being wasted.

Select **Português (Brasil) – pt-BR** and set **App name** to:

${fence(br.name)}

${len(br.name)}/30. Same word people already search for, plus category terms Play
can now index.

While you are on this screen, confirm the other two fields match.

**Short description** — ${len(br.short)}/80

${fence(br.short)}

**Full description** — ${len(br.full)}/4000

${fence(br.full)}

---

${languageSections}

---

## ${nextNumber}. Upload screenshots

Each language has its own screenshot set, on the same Store listings page under
**Phone screenshots**. 8 images per listing, already generated at 1080×1920, in
\`store/screenshots/<listing>/\` — one folder per Play listing, named exactly as the
listing is: \`pt-BR\`, \`pt-PT\`, \`it-IT\`, \`es-ES\`, \`en-US\`, \`fr-FR\`, \`de-DE\`,
\`nl-NL\`, \`ru-RU\`, \`ja-JP\`, \`zh-CN\`, \`ko-KR\`, \`ar\`.

Every file carries its language in the name, so nothing is ambiguous once they are
all sitting in one downloads folder mid-upload:

\`\`\`
it-IT-1-home.png   it-IT-2-tutorial.png   it-IT-3-card-points.png
it-IT-4-setup.png  it-IT-5-game-1v1.png   it-IT-6-game-2v2.png
it-IT-7-practice.png   it-IT-8-settings.png
\`\`\`

Upload them in numbered order — 1 to 8 is the sequence a visitor swipes through,
and the first two are the ones most people ever see.

### Feature graphic — one per language, same page

1024×500, in \`store/feature-graphics/<listing>/<listing>-feature-graphic.png\`.
Thirteen files, one per listing.

Each carries the game's own name in that language — **Briscola** for Italy,
**Bisca** for Portuguese, **Бриска** for Russian — so an Italian visitor no longer
sees a banner reading "BISCA". Play falls back to the default language's graphic
for any language you skip, so nothing breaks if you only do a few.

Regenerate with:

\`\`\`
node scripts/make-feature-graphics.mjs
\`\`\`

Every string comes from \`shared/i18n/translations.ts\` — the app's own copy — and
the card is the hand-drawn \`assets/brand/card-only.svg\`, so these stay free of
AI-authored content too.

### App icon — nothing to do

The icon is wordless (no \`<text>\` in \`assets/brand/icon.svg\`) and Play allows only
one per app, so it is not localizable and needs no per-language version.

Regenerate any time the UI changes:

\`\`\`
npx expo start --port 8097
node scripts/capture-store-screenshots.mjs
\`\`\`

### AI asset declaration → **Don't label assets**

The screenshots are plain captures of the running app: the card faces are licensed
illustration bought from Depositphotos (see \`docs/licenses/README.md\`), the card
backs are drawn by code, and the frames were captured by a browser automation
script. No image model produced any pixel, and the AI-drafted caption overlays have
been removed — so there is nothing to declare.

This matters because the label is currently shown to **EU users**, which is exactly
the Italian, Portuguese and Spanish audience these listings target.

Two things that would change the answer:

- Running the capture script with \`--captions\` burns AI-drafted wording into the
  images. Replace the strings in its \`T\` table with your own first, or leave
  captions off.
- The **store descriptions in this file were AI-drafted**. If the declaration step
  lists text as well as images, declare the text.

---

## ${nextNumber + 1}. Get version 1.2.0 to players

Not a listing change, but nothing collects ratings until players are on a build that
contains the review prompt.

The GitHub Action on \`main\` starts the build but uses \`--no-wait\`, so a green tick
only means the build was queued — check the Expo dashboard for the real result. The
workflow never submits, so submitting is always manual:

\`\`\`
eas submit --platform android --profile production
\`\`\`

---

## Once the listings are in

Submit the sitemap to Google Search Console so the new site gets indexed:

\`\`\`
https://bisca-production.up.railway.app/sitemap.xml
\`\`\`

Then leave it alone. Play metadata takes 3–6 weeks to move rankings. Baseline the
store-listing conversion rate now and look again at week three. Reacting in week one
just makes the signal unreadable.
`;

fs.writeFileSync(OUT, doc);

console.log(`wrote ${OUT} (${doc.length} chars)`);
console.log(`  pt-BR  name ${len(br.name)}/30  short ${len(br.short)}/80  full ${len(br.full)}/4000`);
for (const item of PLAN) {
  const v = pick(item.key);
  const label = item.console.split(' – ')[1] ?? item.key;
  console.log(
    `  ${label.padEnd(6)} name ${String(len(v.name)).padStart(2)}/30  ` +
    `short ${String(len(v.short)).padStart(2)}/80  full ${String(len(v.full)).padStart(4)}/4000  (tier ${item.tier})`
  );
}
