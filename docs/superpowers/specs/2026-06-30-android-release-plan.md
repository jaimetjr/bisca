# Android Release Plan — Ship Brisca to Real Users

**Date:** 2026-06-30
**Scope:** First public Android release on Google Play. **Ads-only** (in-app
purchases deferred — the RevenueCat code stays but is not part of v1).
**Package name:** `com.brisca`

## Legend
- 🔑 **You only** — needs your accounts, money, secrets, or a human decision.
- 💻 **I can do** — code/config changes in this repo.
- ⏳ **Long pole** — has multi-day external lead time; start ASAP.

---

## Critical path (start the slow clocks first)

The launch date is gated by the two slowest external things, which run in
parallel with everything else:

1. ⏳🔑 **Play Console identity verification** — days.
2. ⏳🔑 **Closed-testing requirement** — Google requires new **personal**
   developer accounts to run a closed test with **~12 testers for 14 continuous
   days** before you can request production access. *(Verify the exact current
   number/length in the Console — Google has changed it before.)*

Everything else (backend, email, build) can be done inside that ~2–3 week window.

---

## Phase A — Google Play Console (do today)

1. 🔑 Create the account at play.google.com/console, pay the **$25** one-time fee.
2. 🔑 Start **identity verification** immediately (it's the first long pole).
3. 🔑 Create the app entry: name, default language, **Android**, "App" + "Free".
4. 🔑 Confirm the **package name** is `com.brisca` (must match the build; it can't
   be changed after the first upload).

## Phase B — Production backend (make the app actually work)

Per the existing `TODO.md`. Without this, login and online play fail for users.

5. 🔑 Provision the production Postgres (Railway) and a host for the server.
6. 🔑 Set production env on the host: `JWT_SECRET`, `RECONNECT_TOKEN_SECRET`
   (generate each separately), `DATABASE_URL`, `ALLOWED_ORIGINS` (your real web
   origins).
7. 🔑 Deploy the server, then run `npm run db:push` against the prod DB.
8. 💻 Verify the deployed API is reachable and CORS allows the app origin.

## Phase C — Email sending domain (hard gate)

Email verification is mandatory in the auth flow; Resend's default sender only
delivers to your own address, so **real users can't verify without this.**

9. 🔑 Verify a sending domain in Resend (DNS records).
10. 🔑 Set `RESEND_API_KEY` and `EMAIL_FROM=Bisca <noreply@yourdomain.com>` in
    production env.
11. 💻 Smoke-test: register a fresh address end-to-end and confirm the code arrives.

## Phase D — Client production config

12. 💻 Bake the **production API domain** into the production build
    (`EXPO_PUBLIC_DOMAIN`) via `eas.json` `production.env` (the build currently
    has no server URL).
13. 💻 Confirm `app.json`: app name, icon, adaptive icon, splash, version, and
    `android.permissions` are release-appropriate.
14. 💻 Confirm AdMob App ID is present in the `production` profile (done) and that
    `__DEV__`-only/debug affordances are off in production.

## Phase E — Store listing & compliance (Google requires all of these)

15. 🔑 **Privacy policy URL** (required — you serve ads and collect auth data).
16. 🔑 **Data safety form**: declare what you collect (email, gameplay) and that
    ads/AdMob may collect device identifiers.
17. 🔑 **Content rating** questionnaire.
18. 🔑 Store listing assets: short/full description, app icon, **feature graphic**,
    and **phone screenshots**.
19. 🔑 **Ads declaration**: mark the app as containing ads.

## Phase F — Build, test, release

20. 💻 Build the release AAB: `eas build --profile production --platform android`.
21. 🔑 Upload to **Internal testing** first; install via the opt-in link; sanity
    check launch, auth, online play, and ads on a real device.
    - ⚠️ On a **real phone** you are NOT an auto test device — add its id to
      `EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS` (preview profile) and use a *preview*
      build for your own ad testing, so you never click real ads (ban risk).
22. 🔑 Promote to **Closed testing**, recruit the **~12 testers**, and let the
    **14-day** clock run (this is the long pole from the critical path).
23. 🔑 (Optional) `eas submit` setup: create a Google Play service-account key and
    fill `eas.json` `submit.production` for one-command uploads.
24. 🔑 After the closed-test requirement is met + verification done: apply for
    **production access**, then create the production release and roll out.

---

## Definition of done (v1)
- A real, non-developer user can: install from Play, register, **receive and
  enter the email code**, sign in, play offline and online, and see ads.
- No startup crashes on a clean device; AdMob serves (test ads on your registered
  devices, real ads for everyone else).

## Out of scope (v1)
- In-app purchases / Remove-Ads (RevenueCat code kept, wired later).
- iOS release.
- Anything beyond a basic, compliant first listing.
