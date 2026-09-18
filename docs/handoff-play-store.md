# Handoff — Play Store visibility work

Written 2026-08-30. Read this before touching anything below.

## State right now

All work is **uncommitted** on branch `development`. Nothing is deployed. Users see no change
yet. Do not run `git checkout .`, `git reset --hard`, or `git stash drop` — you will lose all
of it.

Verified green before handoff:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx expo lint` | 0 errors (7 pre-existing warnings in `app/game.tsx`) |
| `npx vitest run tests/unit tests/regression tests/integration/http-routes.test.ts` | 495 passed |
| `npm run server:build` | bundles, landing copy present in output |
| `node scripts/check-store-listing.mjs` | 39 fields, 0 over limit |

## What was built

**1. In-app review prompt.** `shared/lib/review-gate.ts` holds the pure decision logic (no
React/RN imports, so it unit-tests in the node env). `shared/hooks/useReviewPrompt.ts` is thin
IO over it. Wired into the `gameOver` effect in `app/game.tsx`. Fires only after a win, min 3
games, max 3 times ever, 60-day cooldown, and deliberately **before** the interstitial ad.
`app.json` gained `android.playStoreUrl` so the fallback has a target. 9 tests in
`tests/unit/review-gate.test.ts`.

**2. Real landing page + SEO.** `server/lib/landing-content.ts` serves a localized marketing
page (pt-BR/pt-PT/es/it/en/fr/de), plus `robots.txt` and `sitemap.xml`, wired in `server/index.ts`.
Replaces the Expo Go dev stub, which was deleted (`server/templates/landing-page.html`).

**3. Store listings.** `store/listing.md` went 3 → 13 locales, tiered by real demand.
`scripts/check-store-listing.mjs` validates every field against Play's limits.

**4. Screenshots.** `scripts/capture-store-screenshots.mjs` produces 8 shots × 12 locales at
860×1864 into `store/screenshots/<locale>/`.

**5. Promo video script** in `store/promo-video.md`. Not recorded.

## Critical constraint — read before adding any server file

The Dockerfile copies **only** `server_dist` into the runtime image. Not `server/templates`,
not `app.json`, not `assets`, not `static-build`. Any `fs.readFileSync` of a source file works
locally and fails in production. This already caused two outages, including the landing page
serving a bare "API server is running." fallback at the URL listed on the Play listing.

**Anything the server must serve has to be a bundled TypeScript string constant**, following
`server/lib/legal-content.ts` and `server/lib/landing-content.ts`. Verify with:

```
npm run server:build && grep -c "some distinctive copy" server_dist/index.js
```

## Tasks for the next agent

Ordered. Each is independent unless noted.

### 1. Commit the work
Branch off `development`, group into logical commits (review prompt / landing page / store
assets). Do not squash the screenshots in with code.

### 2. Fix the Italian subtitle — do this before Italy launches
`shared/i18n/translations.ts`, the `it` block, `home.subtitle` currently reads
`'Il Classico Gioco di Carte Spagnolo'` — it tells Italian players their own national game is
Spanish, aimed at exactly the audience the new it-IT store listing targets.
Change to `'Il Classico Gioco di Carte Italiano'`.

Check whether the same claim leaks into other locales' `home.subtitle` (the en/es copy calling
it "Spanish" is correct; Italian is the one that is wrong).

### 3. Deploy the server
The website fix only goes live on deploy. After deploying, confirm:
```
curl -s https://bisca-production.up.railway.app/ | head -c 300
curl -s -o /dev/null -w "%{http_code}\n" https://bisca-production.up.railway.app/robots.txt
```
Expect real HTML with `<title>Brisca — ...` and a 200 on robots.txt. If you still see
"API server is running.", the bundle did not pick up `landing-content.ts`.

### 4. Ship an app build with the review prompt
No ratings are collected until users are on a build containing it. EAS production profile.
Bump `version` in `app.json` (currently 1.1.0).

### 5. Optional — put the web build in production
`static-build` is never copied into the Docker image, and `scripts/build.js` (referenced by
`npm run expo:static:build`) **does not exist**, so that script is broken. A browser-playable
Brisca is a real SEO asset no competitor offers. This changes the Docker build and risks the
live deploy, so treat it as its own piece of work with its own testing, not a drive-by.

### 6. Produce the Italian feature graphic
1024×500, matching `store/feature-graphic.html` / `store/feature-graphic-pt.html`. Text:
"BRISCOLA / Il classico gioco di carte".

## Not for an agent — the human must do these in Play Console

Copy is in `store/listing.md`; images in `store/screenshots/<locale>/`.

1. Add the **it-IT** listing (highest-value single action available).
2. Add **pt-PT** as its own locale, separate from the pt-BR default.
3. Fix the live **Spanish short description** — it is 82 characters against an 80 limit today.
   Corrected text is in the file.
4. Upload 8 screenshots per locale, replacing the current 3.
5. Add the remaining Tier 2/3 listings when there is time.

## Things not to waste time on

- **The test AdMob app ID in `app.json` is not a bug.** `app.config.js` filters that plugin
  entry out and rebuilds it from env vars, so the literal never reaches a build.
- **`tests/regression/critical-path.test.ts` is flaky**, not broken by this work. It failed
  once with a teardown race in `tests/integration/helpers.ts`
  (`closeAllConnections` on an undefined server) and passed on every rerun, including on a
  clean checkout.
- **Do not chase the head term "brisca".** La Brisca has 5.7M installs; Brisca Más and Quarzo
  are entrenched. Locale coverage and long tail are the winnable ground.

## Context that is not in the code

- Budget is **$0** for paid acquisition.
- Play re-indexes metadata in days; rankings take **3–6 weeks**. Nothing here moves numbers in
  a week. Baseline store-listing conversion now, re-read at 3 and 6 weeks.
- Demand is real in **Italy** (Briscola, near-universal), **Portugal** (Bisca, top game after
  Sueca) and **Spain/LatAm**. Brazil is weak — Brazilians play Truco, Buraco, Sueca — yet
  pt-BR is the store default.
- `ja/zh/ko/ar` listings exist for completeness only. Expect no installs; do not tune them.
