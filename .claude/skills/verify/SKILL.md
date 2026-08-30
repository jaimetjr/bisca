---
name: verify
description: How to build, launch, and drive this Expo/React Native Brisca app for runtime verification on this machine (web surface via Playwright + system Edge).
---

# Verifying changes in this repo (web surface)

## Launch

1. `npx expo start --port 8081 --clear` (background). Wait for "Waiting on http://localhost:8081". Web bundle builds lazily on first request (~5s).
2. The API server (`npm run server:dev`, port 5000) is NOT needed for local/guest flows — home screen and offline game render fine without it.

## Environment gotchas

- **No package juggling needed any more.** `react-native-web` (^0.21.0), `react` (19.1.0) and
  `react-dom` (19.1.0) are all proper dependencies at matching versions, verified 2026-08-29.
  The old advice to `npm install --no-save react-native-web` / `react-dom@19.1.0` is obsolete —
  web bundles straight from a clean `npm install`.
- Port 8081 is often already taken on this machine, and `npx expo start` cannot prompt in a
  non-interactive shell (it prints "Input is required" and skips the dev server). Always pass
  an explicit free port, e.g. `--port 8097`.
- After swapping packages under a running Metro, restart it with `--clear` or it serves stale failed resolutions / 500s.

## Drive

- No Playwright browsers are downloaded; use system Edge: `chromium.launch({ channel: 'msedge', headless: true })`. Playwright 1.58 is in node_modules (require it by absolute path from scripts outside the repo).
- RN-web maps `testID` → `data-testid`.
- Fresh context = empty localStorage = first-launch state (AsyncStorage is localStorage on web).
- AuthGuard redirects fresh sessions to /login. Enter via the guest button — it has NO testID; match text with `/Continue as Guest|Continuar como Convidado/` (device locale on this machine is pt-BR, so the whole app renders Portuguese by default).
- Force a language: `localStorage.setItem('@bisca:settings', JSON.stringify({ aiDifficulty: 'medium', gameSpeed: 'normal', language: 'es' }))` then reload.
- Useful testIDs: `play-ai-btn`, `play-online-btn`, `settings-btn`, `how-to-play-btn`, `tutorial-modal`, `tutorial-skip-btn`, `tutorial-back-btn`, `tutorial-next-btn`, `tutorial-done-btn`.
- Tutorial seen-flag: localStorage key `@bisca:tutorial_seen` (set to 'true' after any dismiss).
- Modals use `animationType="fade"` — screenshot right after `waitFor(visible)` catches a half-transparent frame; wait ~400ms first.

## Bypassing auth (better than clicking the guest button)

The guest button has no testID and its label changes per locale. Seed the app's own keys
instead — AsyncStorage is localStorage on web, keys stored verbatim:

```js
localStorage.setItem('guest_mode', 'true');            // AuthGuard lets you through
localStorage.setItem('@bisca:tutorial_seen', 'true');  // suppress the auto tutorial
localStorage.setItem('@bisca:settings', JSON.stringify({
  aiDifficulty: 'medium', gameSpeed: 'normal', language: 'it', cardBack: 'verde' }));
```

Use `context.addInitScript(...)` so this lands before the app boots.

## Screens that need the API server

`/stats`, `/quests`, `/achievements` and `/online-lobby` sit on a spinner forever without a
running server AND a logged-in (non-guest) account. Don't try to screenshot or assert on them
in a guest-only session — `scripts/capture-store-screenshots.mjs` deliberately avoids them.

## Flows worth driving

- First launch → login → guest → home (tutorial auto-shows once; reload must not re-show).
- Replay tutorial via the rules card (`how-to-play-btn`) on home.
- Offline AI game: home → Play vs AI → setup → game (AI plays on 600–1000ms timers).
