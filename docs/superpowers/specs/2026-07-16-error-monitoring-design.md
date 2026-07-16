# Error Monitoring (Sentry) + Email/Ads Failure Instrumentation — Design

**Date:** 2026-07-16
**Status:** Implemented

## Problem

The app shipped to the Play Store testing track and two production issues appeared with no way to diagnose them:

1. **Registration verification emails not received.** `server/lib/email.ts` logs every failure mode to the Railway log stream (missing `BREVO_API_KEY` = silent no-send; Brevo rejection = `Brevo send failed` with status/body), but nothing aggregates or alerts on those logs.
2. **Ads not loading.** No ad surface recorded *why*: `useInterstitialAd` had no error listener, `useRewardedAd` discarded the AdMob error object, and the home-screen `BannerAd` had no `onAdFailedToLoad`.

There was no client-side crash reporting at all — `components/ErrorBoundary.tsx` existed but was mounted nowhere.

## Decision

Integrate **Sentry** on both sides (free tier): `@sentry/react-native` (Expo config plugin) for the client, `@sentry/node` for the Express server. Instrument the ad and email failure paths so the two live bugs become diagnosable from Sentry events.

Alternatives rejected: Firebase Crashlytics (weak RN JS-error support, no server coverage), logs-only (no client visibility at all).

## Architecture

### Client
- `Sentry.init` in `app/_layout.tsx`: DSN from `EXPO_PUBLIC_SENTRY_DSN` (set per-profile in `eas.json`), `enabled: !__DEV__ && !!dsn`, `sendDefaultPii: false`, `tracesSampleRate: 0` (errors only).
- Root component exported as `Sentry.wrap(RootLayout)`; the pre-existing `ErrorBoundary` is now mounted as the outermost element with `onError` → `Sentry.captureException` (keeps the existing `ErrorFallback` UX).
- `metro.config.js` uses `getSentryExpoConfig` (drop-in for `getDefaultConfig`) for debug-ID injection / source maps; the `@sentry/react-native/expo` plugin in `app.json` uploads source maps during EAS builds (needs org/project slugs + `SENTRY_AUTH_TOKEN` EAS secret).

### Ad instrumentation
- `shared/lib/ad-monitoring.ts` (client-only): `reportAdLoadError` (breadcrumb + console.warn per failed load) and `reportAdGiveUp` (a real Sentry event, warning level, AdMob error code in the message so issues group per ad-type + failure reason).
- Wired into: `useRewardedAd` (breadcrumb per retry, give-up event when `MAX_LOAD_RETRIES` exhausts), `useInterstitialAd` (new `AdEventType.ERROR` listener — no retry, so one failure = give-up), home-screen `BannerAd` (`onAdFailedToLoad`).

### Server
- `server/lib/instrument.ts`: `Sentry.init` (`SENTRY_DSN` env, enabled only when set, `tracesSampleRate: 0`) — first import of `server/index.ts`. Default integrations capture uncaught exceptions/unhandled rejections.
- **Capture mechanism: a pino `logMethod` hook in `server/lib/logger.ts`**, not per-site `captureException` calls. Every `log.error`/`log.fatal` anywhere on the server (routes, game-rooms, email, GC timers) forwards to Sentry: `err: Error` → `captureException` with remaining log fields as extras; no Error → `captureMessage` with the log message. pino-http request-completion logs (carry `req`/`res`) are skipped to avoid duplicating the more specific route-level log. `Sentry.setupExpressErrorHandler` was deliberately NOT used — the existing error handler in `server/index.ts` already logs `{ err }` through pino, so the hook captures it; adding Sentry's handler would double-report.
- `server/lib/email.ts`: missing `BREVO_API_KEY` in production is now `log.error` (→ Sentry event `BREVO_API_KEY missing in production — email NOT sent`) instead of a dev-style warn, and no longer logs the auth code or recipient in that path.

### Tests
Vitest runs with `LOG_LEVEL=silent`, so pino assigns noop methods and the hook never fires; independently, `enabled: false` (no DSN) makes every Sentry call a no-op.

## Config surface

| Where | Key | Notes |
|---|---|---|
| eas.json (preview/production) | `EXPO_PUBLIC_SENTRY_DSN` | public identifier; empty = disabled |
| app.json plugin | org + client project slugs | REPLACE placeholders |
| EAS secret | `SENTRY_AUTH_TOKEN` | source-map upload |
| Railway | `SENTRY_DSN` | server DSN |

## Diagnosis runbook

**Email (checkable today, no build needed):** (1) Railway variables: `BREVO_API_KEY`, `EMAIL_FROM` set? (2) Railway logs: search `BREVO_API_KEY`, `Brevo send failed`, `failed to send verification email`. (3) Brevo dashboard → Transactional logs: delivered/bounced/blocked, sender verified? (4) Spam-folder test; if delivered-to-spam, authenticate a domain (SPF/DKIM).

**Ads:** (1) AdMob console: app approval status, ad units active, payment verified, Policy Center clean. (2) Closed-testing apps often get no fill until publicly listed — pending AdMob app review alone explains "no ads". (3) app-ads.txt: Play-listing developer website must point at the domain serving `/app-ads.txt`. (4) Post-build: read AdMob error codes in Sentry (`no-fill` = inventory/ramp-up; `invalid-request` = config bug). (5) `requestNonPersonalizedAdsOnly: true` without a UMP consent flow lowers fill — flagged, unchanged.
