---
name: verify
description: How to build, launch, and drive this Expo/React Native Brisca app for runtime verification on this machine (web surface via Playwright + system Edge).
---

# Verifying changes in this repo (web surface)

## Launch

1. `npx expo start --port 8081 --clear` (background). Wait for "Waiting on http://localhost:8081". Web bundle builds lazily on first request (~5s).
2. The API server (`npm run server:dev`, port 5000) is NOT needed for local/guest flows — home screen and offline game render fine without it.

## Environment gotchas (cost ~30 min the first time)

- `react-native-web` is NOT in package.json and web will not bundle without it. Install for the session only: `npm install --no-save react-native-web@~0.21.0` (Expo SDK 54 pairing).
- package.json pins `react` 19.1.0 but `react-dom` ^19.2.4 — react-dom hard-fails on exact-version mismatch with a blank page + console error. Fix for the session: `npm install --no-save react-dom@19.1.0`. NOTE: any later plain `npm install` prunes/reverts these unsaved packages — reinstall both in one command if that happens.
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

## Flows worth driving

- First launch → login → guest → home (tutorial auto-shows once; reload must not re-show).
- Replay tutorial via the rules card (`how-to-play-btn`) on home.
- Offline AI game: home → Play vs AI → setup → game (AI plays on 600–1000ms timers).
