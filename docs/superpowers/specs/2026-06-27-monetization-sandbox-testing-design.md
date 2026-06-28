# Adding Ads to the App — Simple Step-by-Step

**Date:** 2026-06-27
**Platform:** Android first (iOS later, same idea).

## The one thing to understand first

**Ads do NOT show in Expo Go, and they do NOT show in a `development` (dev-client)
build run from `npm start` either.** `metro.config.js` swaps the real ad/purchase
native modules for fake "mock" versions whenever `EAS_BUILD` is not set — and that
is the case both in Expo Go and on your local Metro server. The mocks render no
ads and (until fixed) crash on the purchases listener.

To actually see ads you need a build whose JavaScript was bundled **on the EAS
servers** (where `EAS_BUILD=true`), so the real modules are used. The simplest
such build is the **`preview`** profile: it produces a standalone APK that runs
on its own, with no Metro connection.

In that build, with no ad-unit IDs configured yet, the code falls back to
Google's official **TEST** ad units automatically — so you see real test ads
(they say "Test Ad") with zero AdMob console setup.

---

## Part 1 — See a test ad (start here)

**Goal:** a visible ad in your app on an Android device/emulator.

1. **AdMob App ID is already wired for testing.**
   `eas.json` → `preview` profile sets `ADMOB_APP_ID_ANDROID` to Google's sample
   App ID (`ca-app-pub-3940256099942544~3347511713`). That's enough to see test
   ads. Replace it with your real App ID (from AdMob → App settings) before
   Part 2 — no rush.

2. **Install the build tool.**
   ```
   npm install -g eas-cli
   eas login          # create a free Expo account if you don't have one
   ```

3. **Build the standalone preview app for Android.**
   ```
   eas build --profile preview --platform android
   ```
   Wait ~10–15 min. When it finishes, install the resulting **.apk** on your
   phone (scan the QR / download it) or drag it onto an Android emulator.
   You do NOT run `npm start` for this build — it runs on its own.

4. **Open the app.**
   You should see a banner that says **"Test Ad"** on the home screen, and the
   rewarded-ad button should work.

**Done = you can see a Test Ad in the app.** That's the whole initial part.

> Why not the `development` profile? A dev-client build loads its JS from your
> local `npm start`, where `EAS_BUILD` is unset, so Metro serves the **mocks** and
> you see no ads. The `preview` build bundles its JS on EAS (real modules), so it
> shows ads. (Fast dev iteration with real ads is possible by running
> `EAS_BUILD=true` before `npm start` with a dev-client build — but `preview` is
> the simplest way to just confirm ads work.)

---

## Part 2 — Use your own ad units (after Part 1 works)

Only do this once Part 1 shows test ads.

1. In AdMob, create ad units for your app: **banner**, **interstitial**,
   **rewarded**. Copy each unit ID (`ca-app-pub-...../.....`).
2. Put them in the app's environment variables (the `EXPO_PUBLIC_ADMOB_*_ANDROID`
   names already used in the code; add the missing ones to `.env.example`).
3. **Register your device as a test device** so a release build still shows
   test ads on your phone (showing/clicking your *real* ads yourself can get the
   AdMob account banned). The SDK prints your device's test ID in the logs on the
   first ad — add it to `EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS`.

---

## Part 3 — Later: the "Remove Ads" purchase (separate effort)

This is the in-app purchase side (RevenueCat `remove_ads`) and is a bigger,
account-heavy job. It needs a **Google Play Console** account ($25, plus a few
days for ID verification) and real Play sandbox testing. Outline:

- Split the single RevenueCat key into Android/iOS keys in
  `shared/hooks/useEntitlement.ts`.
- Add a dev-only "force premium" toggle to check that ads hide when premium.
- Create the in-app product in Play Console, add license testers, upload an
  AAB to the internal testing track, and make a real sandbox purchase.

Do this only after ads (Parts 1–2) are working.

---

## Out of scope (not now)

- iOS (same steps, later).
- Production launch / store review.
- Server-side receipt validation / RevenueCat webhooks.
