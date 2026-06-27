# Monetization Sandbox Testing — Design

**Date:** 2026-06-27
**Goal:** Test real in-app purchases (RevenueCat `remove_ads`) and AdMob ads on **Android**, end-to-end, using Google Play's sandbox — without getting your AdMob account banned and without blocking on accounts you don't have yet.

**Approach:** Phased. Make the code and build ready *now* (works in Expo Go for gating logic), then do the Google Play store setup once your Play Console account is verified.

---

## What already exists (no work needed)

- RevenueCat + AdMob accounts.
- Ad code: banner (`app/index.tsx`), interstitial (`shared/hooks/useInterstitialAd.ts`), rewarded (`shared/hooks/useRewardedAd.ts`) — all use Google test ad IDs in dev.
- IAP code: `remove_ads` entitlement (`shared/hooks/useEntitlement.ts`) + buy/restore UI (`app/settings.tsx`).
- `eas.json` with `development` / `preview` / `production` build profiles.
- `metro.config.js` mocks the native modules in Expo Go/web and uses the real ones in EAS builds.

## What's missing (the work)

1. RevenueCat uses one combined key; it needs **separate Android/iOS keys**.
2. **No AdMob test-device registration** — a release build would show you *real* ads, which can get the account banned.
3. `.env.example` is missing most monetization variables.
4. No quick way to check premium gating without a full build.
5. Google Play Console account + first EAS build don't exist yet.

---

## The three test layers (fast → real)

| Layer | Where | Needs accounts? | Proves |
|------|-------|-----------------|--------|
| 1. Logic | Expo Go / web | No | Premium state hides ads + shows premium UI |
| 2. Build | EAS build on a device | No | Real modules load; ads show as **Test Ads** |
| 3. Store sandbox | Play internal track | Yes (Play Console) | A real sandbox purchase flips the entitlement |

---

## Phase 1 — Code & build ready (do now)

### Step 1 — Split the RevenueCat key
In `shared/hooks/useEntitlement.ts`, replace the single `EXPO_PUBLIC_REVENUECAT_API_KEY` with platform-specific keys and pick by platform:

- `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`
- `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`

### Step 2 — Register your test device for ads
In `app/_layout.tsx`, before `mobileAds().initialize()`, call `setRequestConfiguration({ testDeviceIdentifiers })`, reading IDs from a new `EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS` (comma-separated). This guarantees that even release builds show test-flagged ads on your device.

> How to get the device ID: run the app once; the AdMob SDK logs your device's test ID in the console. Paste it into the env var.

### Step 3 — Add a dev-only "force premium" toggle
Add a hidden debug switch in `app/settings.tsx` (visible only when `__DEV__`) that forces `isPremium = true` in `useEntitlement.ts`. Lets you verify gating live with no rebuild. It can never turn on in a production build.

### Step 4 — Document the env vars
Add all monetization variables to `.env.example` with comments:
- `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`, `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`
- `ADMOB_APP_ID_ANDROID`, `ADMOB_APP_ID_IOS`
- `EXPO_PUBLIC_ADMOB_BANNER_ANDROID`, `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID`, `EXPO_PUBLIC_ADMOB_REWARDED_ANDROID` (and iOS equivalents)
- `EXPO_PUBLIC_ADMOB_TEST_DEVICE_IDS`

### Step 5 — Put the env vars into EAS
Register the same variables as EAS environment variables (so `EXPO_PUBLIC_*` and `app.config.js` resolve at build time).

### Step 6 — Build once and check Layer 2
Run an Android EAS build, install it on your device, and confirm:
- The app launches and RevenueCat configures (no crash).
- Ads appear with the yellow **"Test Ad"** label.

---

## Phase 2 — Google Play sandbox (do when Play Console is verified)

### Step 7 — Create the Play Console account
Pay the one-time $25, start identity verification (can take a few days). Create the app entry with your final package name.

### Step 8 — Create the in-app product
Create the product(s) in Play Console with IDs that match your RevenueCat offering, and confirm they're attached to the `remove_ads` entitlement in RevenueCat.

### Step 9 — Add license testers
Play Console → License testing → add your tester Google account(s). These accounts get sandbox (free) purchases.

### Step 10 — Upload to internal testing
`eas build` an Android **AAB**, upload it to the **internal testing** track, and opt in via the test link. Install the app *from Google Play* (this is required for billing to work).

### Step 11 — Run the real test (Layer 3)
As a license tester:
1. Buy "Remove Ads" → confirm `isPremium` flips and all ads disappear.
2. Reinstall the app → tap **Restore** → confirm premium comes back.

---

## Deliverable

A runbook in `docs/` (checklist form) covering all steps above, so the Android flow can be repeated for iOS later. It replaces the monetization notes scattered in `TODO.md`.

## Acceptance criteria

- **Layer 1:** force-premium ON hides banner + interstitial + rewarded and shows "Premium active"; OFF brings ads + buy buttons back.
- **Layer 2:** EAS build runs; RevenueCat configures with the Android key; ads carry the **Test Ad** label.
- **Layer 3 (later):** a sandbox purchase flips the entitlement and survives reinstall via Restore.

## Out of scope (not now)

- iOS sandbox (later phase, same steps).
- Production launch / store review / the new-account "20 testers for 14 days" rule.
- Automated tests for purchases (the existing mocks already cover unit logic).
- Server-side receipt validation / RevenueCat webhooks.
