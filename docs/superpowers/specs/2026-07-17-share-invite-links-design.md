# Shareable HTTPS Invite Links — Design

**Date:** 2026-07-17
**Status:** Approved (Phase 1)

## Problem

Sharing a room invite sends `bisca:///online-lobby?action=join&roomCode=X`. Custom-scheme
URLs are not clickable in Gmail/WhatsApp, do nothing for recipients without the app, and
even when opened they skip name entry (online-lobby joins with an undefined player name).

## Decision (user-approved)

Phase 1 only: share an HTTPS link to our own server that lands on a small page with
"open in app" / "get the app" / manual code. Android App Links auto-open (assetlinks.json
+ intentFilters) is deferred until closer to public release — it needs the Play signing
SHA-256 fingerprint and a rebuild. Third-party link services rejected (Dynamic Links is
deprecated; our server already serves HTML).

## Components

1. **Server — `GET /join/:code`** (in `registerRoutes`, covered by http-routes tests).
   Validates code (`/^[A-Za-z0-9]{4,6}$/`, uppercased); invalid → 404. Renders a bundled
   HTML page (`server/lib/join-page.ts`, same self-contained pattern as legal-content):
   room code shown large, button "Abrir no app" → `bisca:///join?code=X`, button
   "Baixar o app" → Play Store `com.jaimetjr.bisca`, note to enter the code manually.
   PT-BR copy (store audience) with a one-line EN fallback.
2. **Client — share message** (`app/online-lobby.tsx` `handleShare`): message becomes
   localized text + code + `https://<api-host>/join/<code>` (via `getApiUrl()`).
3. **Client — `app/join.tsx`**: deep-link entry for `bisca:///join?code=X` (and future
   App Links). Normalizes the code and `router.replace` → `/setup?mode=online&roomCode=X`.
4. **Client — `app/setup.tsx`**: optional `roomCode` param seeds the room-code state and
   preselects the *join* tab, so the recipient only types a name.

## Known limitations (accepted)

- Closed testing: the Play Store button only works for opted-in testers.
- A recipient who is neither signed in nor in guest mode gets AuthGuard-redirected to
  login and must re-tap the link or type the visible code afterward. No pending-link
  storage in Phase 1.
- Browser page → app hand-off relies on the custom scheme until Phase 2 App Links.

## Testing

- Integration (supertest): `/join/WDAK7` → 200 HTML containing the code, the scheme link,
  and the Play Store URL; `/join/<garbage>` → 404. TDD red→green.
- Full suite + tsc + lint. Manual: probe the deployed page; client flow verified on the
  next EAS build (share → link → setup prefilled).
